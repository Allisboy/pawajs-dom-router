import type { Plugin } from "vite";

export interface PawaFileRouterOptions {
  /** Directory containing file-based routes, relative to the Vite root. */
  pagesDir?: string;
}

/** Creates the Vite plugin that generates the `~pages` virtual module. */
export declare function pawaFileRouter(options?: PawaFileRouterOptions): Plugin;
