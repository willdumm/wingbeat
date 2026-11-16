/**
 * The duty log's PDF, compiled as the web compiles it: core's Typst source
 * (@wingbeat/core/duty-pdf) through typst.ts's WASM compiler. Hermes can't run the WASM, so a
 * hidden WebView loads the compiler and the font from jsdelivr (no session, as the web does)
 * and hands back the PDF's bytes; the app writes them to its cache directory and opens the
 * share sheet. The WebView mounts on the first export and stays while the screen does, so a
 * second export skips loading the compiler; the page's Cache API keeps the downloads (about
 * 28 MB) across launches.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { TYPST_FONT_URLS, TYPST_SCRIPT_URL, TYPST_WASM_URL } from '@wingbeat/core/duty-pdf';

// Its typings default the extra props to undefined, which makes every prop never.
const Web = WebView<Record<never, never>>;

type PageMessage =
  | { type: 'status'; text: string }
  | { type: 'done'; base64: string }
  | { type: 'error'; message: string };

// fetchCached is the web's _typstFetchCached (src/shared/pilot-duty.ts) without the
// progress; the status line counts the downloads instead. The cache is only a speed-up: when
// it can't be opened, read or written, the files are fetched again.
const PAGE = `<!doctype html><meta charset="utf-8">
<script>
const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
async function fetchCached(cache, url) {
  try {
    const cached = cache && await cache.match(url);
    if (cached) return await cached.arrayBuffer();
  } catch (_) {}
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  if (cache) {
    try {
      await cache.put(url, new Response(buf, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' } }));
    } catch (_) {}
  }
  return buf;
}
let typst = null;
function load() {
  if (!typst) {
    typst = (async () => {
      post({ type: 'status', text: 'Loading the PDF compiler…' });
      const mod = await import(${JSON.stringify(TYPST_SCRIPT_URL)});
      let cache = null;
      try { cache = await caches.open('ft-typst-v1'); } catch (_) {}
      const urls = [${JSON.stringify(TYPST_WASM_URL)}, ...${JSON.stringify(TYPST_FONT_URLS)}];
      let done = 0;
      post({ type: 'status', text: 'Downloading the PDF compiler…' });
      const [wasm, ...fonts] = await Promise.all(urls.map((url) => fetchCached(cache, url).then((buf) => {
        post({ type: 'status', text: 'Downloading the PDF compiler (' + ++done + ' of ' + urls.length + ')…' });
        return buf;
      })));
      mod.$typst.setCompilerInitOptions({
        getModule: () => wasm,
        beforeBuild: [mod.loadFonts(fonts.map((buf) => new Uint8Array(buf)))],
      });
      return mod.$typst;
    })();
    typst.catch(() => { typst = null; });
  }
  return typst;
}
window.compileDutyPdf = async (source) => {
  try {
    const compiler = await load();
    post({ type: 'status', text: 'Compiling the PDF…' });
    const bytes = await compiler.pdf({ mainContent: source });
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(new Blob([bytes], { type: 'application/pdf' }));
    });
    post({ type: 'done', base64 });
  } catch (e) {
    post({ type: 'error', message: e && e.message ? e.message : String(e) });
  }
};
</script>`;

/**
 * exportPdf(source, name) compiles source (dutyLogTypstSource's) and shares it as name;
 * it rejects when the compile fails, and resolves once the share sheet closes. status is
 * what it's doing (null when it isn't). Render compiler anywhere on the screen.
 */
export function useDutyPdf(): {
  status: string | null;
  exportPdf: (source: string, name: string) => Promise<void>;
  compiler: ReactNode;
} {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const web = useRef<InstanceType<typeof Web>>(null);
  const loaded = useRef(false);
  const queued = useRef<string | null>(null);
  const job = useRef<{ resolve: (base64: string) => void; reject: (e: Error) => void } | null>(null);

  const fail = (message: string) => {
    job.current?.reject(new Error(message));
    job.current = null;
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let m: Partial<PageMessage> | null = null;
    try { m = JSON.parse(e.nativeEvent.data); } catch { /* not the page's: fails below */ }
    if (m?.type === 'status' && typeof m.text === 'string') setStatus(m.text);
    else if (m?.type === 'done' && typeof m.base64 === 'string') { job.current?.resolve(m.base64); job.current = null; }
    else fail(m?.type === 'error' && typeof m.message === 'string' ? m.message : 'The PDF compiler sent something unexpected.');
  };

  const exportPdf = useCallback(async (source: string, name: string) => {
    // The page compiles one at a time; a second job would orphan the first's promise.
    if (job.current) throw new Error('An export is already running.');
    setStatus('Preparing the PDF…');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        job.current = { resolve, reject };
        const call = `compileDutyPdf(${JSON.stringify(source)}); true;`;
        if (loaded.current) web.current?.injectJavaScript(call);
        else { queued.current = call; setMounted(true); }
      });
      const file = new File(Paths.cache, name);
      file.create({ overwrite: true });
      await file.write(base64, { encoding: 'base64' });
      setStatus(null);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
    } finally {
      setStatus(null);
    }
  }, []);

  // The WebView's own container is flex: 1 (containerStyle, not style): a 1 px box that
  // takes no touches.
  const compiler = mounted && (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
      <Web ref={web} source={{ html: PAGE, baseUrl: 'https://localhost/' }} originWhitelist={['*']}
        containerStyle={{ width: 1, height: 1, flex: 0 }} style={{ width: 1, height: 1 }}
        onMessage={onMessage}
        onLoadEnd={() => {
          loaded.current = true;
          if (queued.current) web.current?.injectJavaScript(queued.current);
          queued.current = null;
        }}
        // iOS can end the WebView's process (memory); the compile in it is lost.
        onContentProcessDidTerminate={() => {
          loaded.current = false;
          fail('The PDF compiler stopped. Try again.');
          web.current?.reload();
        }} />
    </View>
  );

  return { status, exportPdf, compiler };
}
