// fetcher.js
import { $state, useContext } from "pawajs"
import { routeContext } from "."
import { routeReaderContext } from "./routeReader"

const loaderCache = new Map()          // path → { data, timestamp }
const pendingLoaders = new Map()       // path → Promise
export const loaderFns = new Map()
/**
 * Returns only the nodes that are new compared to the previous tree
 */
export const selectNewNodes = (formerTree = [], newTree = []) => {
  const formerNames = new Set(formerTree.map(n => n?.name))
  return newTree.filter(n => n?.name && !formerNames.has(n.name)) || newTree
}

/**
 * Register a loader for a route/page.
 * Call this inside your page modules:
 *    export const loader = async ({ params, query, path }) => { ... }
 */
export const useLoader = (loaderFn) => {
  // This will be picked up when the module is imported
  return loaderFn
}

/**
 * Main data-loading function
 */
export const loadRouteData = async ({
  formerTree = [],
  newTree = [],
  path,
  params = {},
  query = {},
  signal                     // AbortSignal for cancellation
}) => {
  const nodesToLoad = selectNewNodes(formerTree, newTree)

  if (nodesToLoad.length === 0) {
    return { data: {}, guards: [] }
  }

  // Collect loaders & guards from the modules
  const loaderPromises = []
  const guardFns = []

  for (const node of nodesToLoad) {
    try {
      const mod = await node.page()          // dynamic import
      const loader = mod.loader || mod.default?.loader
      const guard = mod.guard || mod.default?.guard

      if (typeof loader === 'function') {
        loaderFns.set(node.name, loader)
        loaderPromises.push(
          runLoader(loader, {
            name: node.name,
            path,
            params,
            query,
            signal
          })
        )
      }

      if (typeof guard === 'function') {
        guardFns.push({ name: node.name, guard })
      }
    } catch (err) {
      const moduleError = new Error(`Failed to load route module: ${node.name}`, {
        cause: err
      })
      moduleError.routeName = node.name
      throw moduleError
    }
  }

  // Run all loaders in parallel
  const results = await Promise.all(loaderPromises)

  const data = {}
  for (const result of results) {
    if (result) data[result.name] = result.data
  }

  return { data, guards: guardFns }
}

/**
 * Execute a single loader with caching + cancellation support
 */
export async function runLoader(loaderFn, { name, path, params, query, signal }) {
  const cacheKey = `${path}::${name}`

  // Return cached data if available (optional – remove if you always want fresh data)
  if (loaderCache.has(cacheKey)) {
    return { name, data: loaderCache.get(cacheKey) }
  }

  // Deduplicate in-flight requests
  if (pendingLoaders.has(cacheKey)) {
    const data = await pendingLoaders.get(cacheKey)
    return { name, data }
  }

  const promise = (async () => {
    try {
      const data = await loaderFn({ params, query, path, signal })
      loaderCache.set(cacheKey, data)
      return data
    } finally {
      pendingLoaders.delete(cacheKey)
    }
  })()

  pendingLoaders.set(cacheKey, promise)
  const data = await promise
  return { name, data }
}

/**
 * Clear cache for a specific path (useful after mutations)
 */
export const invalidateLoader = (path, name = null) => {
  if (name) {
    loaderCache.delete(`${path}::${name}`)
    return
  } 
  // Invalidate every loader that belongs to this path
  for (const key of loaderCache.keys()) {
    if (key.startsWith(path + "::")) {
      loaderCache.delete(key)
    }
  }
}
/** Invalidate by route name only (across any path) */
export const invalidateByName = (name) => {
  for (const key of loaderCache.keys()) {
    if (key.endsWith(`::${name}`)) {
      loaderCache.delete(key)
    }
  }
}

export const clearLoaderCache = () => loaderCache.clear()
export const runGuards = async (guards, context) => {
  const { params, query, path, data, navigate } = context

  for (const { name, guard } of guards) {
    try {
      const result = await guard({
        params,
        query,
        path,
        data: data[name],          // this route's own loader data
        allData: data,             // all loaded data (useful for layouts)
        navigate
      })

      if (result === false) {
        return { allowed: false, reason: 'denied', name }
      }

      if (typeof result === 'string') {
        return { allowed: false, redirect: result, name }
      }
    } catch (err) {
      console.error(`Guard error in ${name}:`, err)
      return { allowed: false, reason: 'error', name, error: err }
    }
  }

  return { allowed: true }
}
// fetcher.js  (additions / changes)

export const useRouteData = () => {
  const { loadData, route } = useContext(routeContext)
  const { name, path } = useContext(routeReaderContext) || {}

  const data = loadData?.value?.[name]

  /**
   * Force re-run the loader for the current route/page
   */
  const reload = async (options = {}) => {
    if (!name) return null

    const {
      params = {},
      query = {},
      signal
    } = options

    // Clear cache so the loader actually runs again
    invalidateLoader(window.location.pathname, name)

    // We need the original loader function.
    // The cleanest way is to keep a reference to the loaders when we first load them.
    const loaderFn = loaderFns.get(name)   // see below

    if (typeof loaderFn !== 'function') {
      console.warn(`No loader registered for ${name}`)
      return null
    }

    try {
      const result = await runLoader(loaderFn, {
        name,
        path: window.location.pathname,
        params,
        query: query || Object.fromEntries(new URLSearchParams(window.location.search)),
        signal
      })

      // Update the reactive store
      if (loadData?.value) {
        loadData.value = {
          ...loadData.value,
          [name]: result.data
        }
      }

      return result.data
    } catch (err) {
      console.error(`Reload failed for ${name}:`, err)
      throw err
    }
  }

  return {
    data,
    reload,
    name
  }
}
export const cache = {
  invalidate: invalidateLoader,      // (path, name?)
  invalidateName: invalidateByName,  // (name)
  clear: clearLoaderCache,
}