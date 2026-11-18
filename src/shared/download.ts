/**
 * Saving a file the page made: the flights export, the regions' and named points' GeoJSON
 * (Settings) and the duty log's PDF. Included once per page (dashboard, analytics, and the
 * docs-site showcase, whose duty log exports a PDF).
 */
export function downloadScript(): string {
  return `
    // Saves blob as filename through a temporary link. The object URL is revoked on the next
    // tick rather than at once: some browsers (Safari) start the download asynchronously
    // and fail it if the URL is already gone.
    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  `;
}
