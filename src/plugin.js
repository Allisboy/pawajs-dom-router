import { PluginSystem } from "pawajs"
import { layoutMap, matchRoute } from "."
import { runLoader, loaderFns } from "./Fetcher"   // make sure you export these

const prefetched = new Set()

export const RoutePlugin = () => {
  PluginSystem(() => ({
    attribute: {
      register: [
        // ---------- route-link ----------
        {
          fullName: "route-link",
          plugin: (el) => {
            if (el.tagName !== "A") return

            el.addEventListener("click", (e) => {
              if (
                e.defaultPrevented ||
                e.button !== 0 ||
                e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
              ) return

              const url = new URL(el.href, window.location.origin)
              if (url.origin !== window.location.origin) return

              e.preventDefault()
              history.pushState({}, "", url.pathname + url.search + url.hash)
            })
          }
        },

        // ---------- route-prefetch ----------
        {
          fullName: "route-prefetch",
          mode: "client",
          plugin: (el, attr) => {
            if (el.tagName !== "A") return

            const href = el.getAttribute("href")
            if (!href || href.startsWith("http") || href.startsWith("mailto:")) return

            const prefetch = async () => {
              const url = new URL(href, window.location.origin)
              const path = url.pathname + url.search

              if (prefetched.has(path)) return
              prefetched.add(path)

              const [matched, params, query, routeData] = matchRoute(path)
              if (!matched || !routeData) return

              const modules = []

              // Collect layout + page modules
              if (routeData.layout?.length) {
                for (const layoutName of routeData.layout) {
                  const layout = layoutMap.get(layoutName)
                  if (layout?.page) modules.push({ name: layoutName, load: layout.page })
                }
              }
              modules.push({ name: routeData.name, load: routeData.page })

              // 1. Load all modules in parallel
              const loaded = await Promise.all(
                modules.map(async ({ name, load }) => {
                  try {
                    const mod = await load()
                    return { name, mod }
                  } catch {
                    return null
                  }
                })
              )

              // 2. Run guards first (parent → child order)
              for (const item of loaded) {
                if (!item) continue
                const guard = item.mod.guard || item.mod.default?.guard
                if (typeof guard !== "function") continue

                try {
                  const result = await guard({
                    params: params || {},
                    query: query || Object.fromEntries(new URLSearchParams(url.search)),
                    path,
                    data: null,          // no loader data yet
                    allData: {},
                    navigate: () => {}   // no-op during prefetch
                  })

                  // If guard blocks or redirects → stop prefetching this route
                  if (result === false || typeof result === "string") {
                    return
                  }
                } catch {
                  return // treat guard error as "don't prefetch"
                }
              }

              // 3. Run loaders (only if all guards passed)
              for (const item of loaded) {
                if (!item) continue
                const loader = item.mod.loader || item.mod.default?.loader
                if (typeof loader !== "function") continue

                // Save reference so useRouteData().reload() still works
                loaderFns.set(item.name, loader)

                // Fire and forget – warm the cache
                runLoader(loader, {
                  name: item.name,
                  path,
                  params: params || {},
                  query: query || Object.fromEntries(new URLSearchParams(url.search)),
                  signal: undefined
                }).catch(() => {
                  // silent fail
                })
              }
            }

            // Default strategy: prefetch on hover
            el.addEventListener("pointerenter", () => {
              prefetch()
            }, { once: true })

            // Optional immediate prefetch
            if (attr === "immediate" || attr === "" || attr === true) {
              setTimeout(prefetch, 100)
            }
          }
        }
      ]
    }
  }))
}