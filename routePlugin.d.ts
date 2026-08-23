import type { Plugin } from "vite"

export interface PawaFileRoutesOptions {
  /** Directory containing the route files. */
  routesDir?: string
  /** Generated route module path. */
  output?: string
  /** File extensions recognized for page, layout, and not-found files. */
  extensions?: string[]
}

/**
 * Generates the route tree during Vite builds and watches route files in development.
 */
export declare function pawaFileRoutes(
  options?: PawaFileRoutesOptions
): Plugin
