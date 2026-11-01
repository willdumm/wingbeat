/** Matches the `Text` module rule in wrangler.toml: an .svg import resolves to its raw source. */
declare module '*.svg' {
  const content: string;
  export default content;
}

/** Wrangler's default `Text` module rule: a .txt import resolves to its contents (the core bundle). */
declare module '*.txt' {
  const content: string;
  export default content;
}
