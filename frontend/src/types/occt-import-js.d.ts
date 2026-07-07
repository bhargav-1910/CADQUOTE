declare module 'occt-import-js' {
  interface OcctModuleOptions {
    locateFile?: (file: string) => string;
  }
  const init: (options?: OcctModuleOptions) => Promise<any>;
  export default init;
}

declare module 'occt-import-js/dist/occt-import-js.wasm?url' {
  const url: string;
  export default url;
}
