/** Matches the `Text` module rule in wrangler.toml: an .svg import resolves to its raw source. */
declare module '*.svg' {
  const content: string;
  export default content;
}
