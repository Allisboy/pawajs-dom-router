// vite-plugin-pawa-file-routes.js
import fs from "fs"
import path from "path"
import { normalizePath } from "vite"

export function pawaFileRoutes(options = {}) {
  const {
    routesDir = "src/routes",
    output = "src/routes/generated-routes.js",
    extensions = [".js",  ".ts"]
  } = options

  let root = process.cwd()

  const isExt = (name, base) =>
    extensions.some((ext) => name === `${base}${ext}`)

  function toSegment(folder) {
    if (folder.startsWith("[...") && folder.endsWith("]")) {
      return `*${folder.slice(4, -1)}`
    }
    if (folder.startsWith("[") && folder.endsWith("]")) {
      return `:${folder.slice(1, -1)}`
    }
    if (folder.startsWith("(") && folder.endsWith(")")) {
      return null // route group
    }
    return folder
  }

  function relImport(from, to) {
    let rel = normalizePath(path.relative(path.dirname(from), to))
    if (!rel.startsWith(".")) rel = "./" + rel
    return rel
  }

  /**
   * Walk the routes directory and build a nested tree
   * that matches your router's expected shape.
   */
  function walk(dir, urlParts = [], layoutStack = []) {
    const entries = fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true })
      : []

    let pageFile = null
    let layoutFile = null
    let notFoundFile = null
    const childFolders = []

    for (const entry of entries) {
      const full = path.join(dir, entry.name)

      if (entry.isFile()) {
        if (isExt(entry.name, "page")) pageFile = full
        else if (isExt(entry.name, "layout")) layoutFile = full
        else if (isExt(entry.name, "404") || isExt(entry.name, "not-found")) {
          notFoundFile = full
        }
      } else if (entry.isDirectory()) {
        childFolders.push(entry.name)
      }
    }

    // Current layout stack for this level
    const currentLayoutStack = layoutFile
      ? [...layoutStack, layoutFile]
      : [...layoutStack]

    const nodes = []

    // 1. Page at this level
    if (pageFile) {
      const routePath =
        urlParts.length === 0 ? "/" : "/" + urlParts.filter(Boolean).join("/")

      const name =
        urlParts.length === 0
          ? "home"
          : urlParts
              .filter(Boolean)
              .join("-")
              .replace(/[:*]/g, "")

      nodes.push({
        type: "page",
        route: routePath,
        name,
        page: pageFile,
        layouts: currentLayoutStack
      })
    }

    // 2. Not-found at this level
    if (notFoundFile) {
      nodes.push({
        type: "notfound",
        name: (urlParts.filter(Boolean).join("-") || "root") + "-404",
        page: notFoundFile,
        layouts: currentLayoutStack
      })
    }

    // 3. Recurse into folders
    for (const folder of childFolders) {
      const segment = toSegment(folder)
      const nextUrl = segment ? [...urlParts, segment] : [...urlParts]

      const childNodes = walk(
        path.join(dir, folder),
        nextUrl,
        currentLayoutStack
      )
      nodes.push(...childNodes)
    }

    return nodes
  }

  function generate() {
    const flat = walk(path.join(root, routesDir))
    const outFile = path.join(root, output)

    // Group pages by their full layout chain
    const groups = new Map()

    for (const node of flat) {
      const key = node.layouts.map((l) => l).join("||") || "ROOT"

      if (!groups.has(key)) {
        groups.set(key, {
          layouts: node.layouts,
          children: []
        })
      }

      const group = groups.get(key)

      if (node.type === "notfound") {
        group.children.push({
          notfound: true,
          name: node.name,
          page: node.page
        })
      } else {
        group.children.push({
          route: node.route,
          name: node.name,
          page: node.page
        })
      }
    }

    // Build the final nested structure your router expects
    const allRoutes = []

    for (const [, group] of groups) {
      if (group.layouts.length === 0) {
        // No layout – rare, just emit flat routes
        for (const child of group.children) {
          allRoutes.push({
            route: child.route,
            name: child.name,
            page: `() => import("${relImport(outFile, child.page)}")`
          })
        }
        continue
      }

      // Create nested layout chain
      // We emit the outermost layout and nest the rest as children
      // For simplicity and compatibility with your current router,
      // we emit one layout entry per unique deepest layout,
      // while still recording the full chain via the way pages are grouped.

      const deepestLayout = group.layouts[group.layouts.length - 1]
      const layoutName =
        path.basename(path.dirname(deepestLayout)) || "root"

      allRoutes.push({
        layout: true,
        name: layoutName === "routes" ? "root-layout" : `${layoutName}-layout`,
        page: `() => import("${relImport(outFile, deepestLayout)}")`,
        children: group.children.map((child) => {
          if (child.notfound) {
            return {
              notfound: true,
              name: child.name,
              page: `() => import("${relImport(outFile, child.page)}")`
            }
          }
          return {
            route: child.route,
            name: child.name,
            page: `() => import("${relImport(outFile, child.page)}")`
          }
        })
      })
    }

    // Generate final source code
    const code = `// AUTO-GENERATED BY vite-plugin-pawa-file-routes – DO NOT EDIT
export const allRoutes = [
${allRoutes
  .map((r) => {
    if (r.layout) {
      const childrenCode = r.children
        .map((c) => {
          if (c.notfound) {
            return `      {
        notfound: true,
        name: "${c.name}",
        page: ${c.page}
      }`
          }
          return `      {
        route: "${c.route}",
        name: "${c.name}",
        page: ${c.page}
      }`
        })
        .join(",\n")

      return `  {
    layout: true,
    name: "${r.name}",
    page: ${r.page},
    children: [
${childrenCode}
    ]
  }`
    }

    return `  {
    route: "${r.route}",
    name: "${r.name}",
    page: ${r.page}
  }`
  })
  .join(",\n")}
]
`
    return code
  }

  return {
    name: "vite-plugin-pawa-file-routes",

    configResolved(config) {
      root = config.root
    },

    buildStart() {
      const code = generate()
      const out = path.join(root, output)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, code, "utf-8")
    },

    configureServer(server) {
      const watchDir = path.join(root, routesDir)
      server.watcher.add(watchDir)

      server.watcher.on("all", (_, file) => {
        if (file.startsWith(watchDir)) {
          const code = generate()
          fs.writeFileSync(path.join(root, output), code, "utf-8")
          server.ws.send({ type: "full-reload", path: "*" })
        }
      })
    }
  }
}