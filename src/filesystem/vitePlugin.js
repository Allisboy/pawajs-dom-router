import fs from "node:fs/promises";
import path from "node:path";

const virtualModuleId = "~pages";
const resolvedVirtualModuleId = "\0pawa-file-routes";
const routeExtensions = new Set([".js", ".ts", ".tsx"]);

export const detectRouteHooks = (source) => {
  const exports = new Set();
  const declarationPattern = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g;
  const exportListPattern = /\bexport\s*\{([^}]+)\}/g;

  for (const match of source.matchAll(declarationPattern)) exports.add(match[1]);
  for (const match of source.matchAll(exportListPattern)) {
    for (const item of match[1].split(",")) {
      const [localName, exportedName] = item.trim().split(/\s+as\s+/);
      exports.add(exportedName ?? localName);
    }
  }

  return {
    guard: exports.has("guard"),
    preload: exports.has("preload"),
  };
};

export const routePathFromFile = (filePath, pagesDir) => {
  const relativePath = path.relative(pagesDir, filePath).replace(/\\/g, "/");
  const segments = relativePath.replace(/\.[^.]+$/, "").split("/");
  const routeSegments = segments.flatMap((segment) => {
    if (segment === "index") return [];
    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
    if (catchAll) return [`:...${catchAll[1]}`];
    const dynamic = segment.match(/^\[(.+)\]$/);
    if (dynamic) return [`:${dynamic[1]}`];
    return [segment];
  });

  return `/${routeSegments.join("/")}`;
};

export const nestFileRoutes = (routes, pagesDir) => {
  const routesByFile = new Map(routes.map((route) => [path.resolve(route.sourceFile), route]));
  const childrenByFile = new Map();
  const roots = [];
  const findIndexRoute = (directory, currentRoute) => {
    for (const extension of routeExtensions) {
      const route = routesByFile.get(path.resolve(directory, `index${extension}`));
      if (route && route !== currentRoute) return route;
    }
  };

  for (const route of routes) {
    let directory = path.dirname(route.sourceFile);
    const fileName = path.basename(route.sourceFile, path.extname(route.sourceFile));
    const isIndexRoute = fileName === "index";
    const routeDirectory = directory;
    let parent;

    if (directory !== pagesDir) {
      const directoryName = path.basename(directory);
      for (const extension of routeExtensions) {
        const layoutRoute = routesByFile.get(path.resolve(
          path.dirname(directory),
          `${directoryName}${extension}`,
        ));
        if (layoutRoute && layoutRoute !== route) {
          parent = layoutRoute;
          break;
        }
      }
    }

    if (!parent && !isIndexRoute && routeDirectory !== pagesDir) {
      parent = findIndexRoute(routeDirectory, route);
    }
    if (isIndexRoute) directory = path.dirname(directory);

    while (directory !== pagesDir && directory.startsWith(`${pagesDir}${path.sep}`)) {
      parent ??= findIndexRoute(directory, route);
      if (parent) break;
      directory = path.dirname(directory);
    }

    if (!parent) {
      roots.push(route);
      continue;
    }

    const siblings = childrenByFile.get(parent.sourceFile) ?? [];
    siblings.push(route);
    childrenByFile.set(parent.sourceFile, siblings);
  }

  const serialize = (route, parentPath = "") => {
    const children = childrenByFile.get(route.sourceFile) ?? [];
    const childPath = parentPath
      ? route.path.slice(parentPath.length) || "/"
      : route.path;
    const relativePath = parentPath && !childPath.startsWith("/") ? `/${childPath}` : childPath;
    return {
      name: route.name,
      path: relativePath,
      sourceFile: route.sourceFile,
      component: route.component,
      guard: route.guard,
      preload: route.preload,
      layout: children.length > 0,
      children: children.map((child) => serialize(child, route.path)),
    };
  };

  return roots.map((route) => serialize(route));
};

const routeNameFromPath = (routePath) => {
  const name = routePath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/^:\.\.\.?/, "").replace(/^:/, ""))
    .join("-");
  return name || "index";
};

export const pawaFileRouter = ({ pagesDir = "src/pages" } = {}) => {
  let root = process.cwd();
  let resolvedPagesDir;

  const collectRoutes = async (directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const routes = [];

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith("_") || entry.name === "components") continue;
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        routes.push(...await collectRoutes(fullPath));
        continue;
      }

      if (!entry.isFile() || !routeExtensions.has(path.extname(entry.name))) continue;

      const source = await fs.readFile(fullPath, "utf8");
      const hooks = detectRouteHooks(source);
      const relativePath = `/${path.relative(root, fullPath).split(path.sep).join("/")}`;
      const routePath = routePathFromFile(fullPath, resolvedPagesDir);
      routes.push({
        name: routeNameFromPath(routePath),
        path: routePath,
        sourceFile: fullPath,
        component: `() => import(${JSON.stringify(relativePath)})`,
        ...hooks,
      });
    }

    return routes;
  };

  return {
    name: "pawa-file-router",
    enforce: "pre",
       configureServer(server) {
     const refresh = (file) => {
       if (!file.startsWith(resolvedPagesDir + path.sep)) return;
       const mod = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
       if (mod) {
         server.moduleGraph.invalidateModule(mod);
         server.ws.send({ type: "full-reload" });
       }
     };
     server.watcher.on("add", refresh).on("unlink", refresh);
   },
    configResolved(config) {
      root = config.root;
      resolvedPagesDir = path.resolve(root, pagesDir);
    },
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
    },
    async load(id) {
      if (id !== resolvedVirtualModuleId) return;
      const routes = await collectRoutes(resolvedPagesDir);
      const pathCounts = new Map();
      for (const route of routes) pathCounts.set(route.path, (pathCounts.get(route.path) ?? 0) + 1);
      for (const route of routes) {
        if (pathCounts.get(route.path) > 1) {
          const suffix = path.basename(route.sourceFile, path.extname(route.sourceFile))
            .replace(/^\[(?:\.\.\.)?(.+)\]$/, "$1");
          route.name = `${route.name}-${suffix}`;
        }
      }
      const nestedRoutes = nestFileRoutes(routes, resolvedPagesDir);
      const serialize = (route) => `{
        name: ${JSON.stringify(route.name)},
        path: ${JSON.stringify(route.path)},
        component: ${route.component},
        guard: ${route.guard},
        preload: ${route.preload},
        layout: ${route.layout},
        children: [${route.children.map(serialize).join(",")}],
      }`;
      return `export default [${nestedRoutes.map(serialize).join(",")}];`;
    },
    handleHotUpdate({ file, server }) {
      if (!file.startsWith(`${resolvedPagesDir}${path.sep}`)) return;
      const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
      if (!module) return;
      server.moduleGraph.invalidateModule(module);
      return [module];
    },
  };
};