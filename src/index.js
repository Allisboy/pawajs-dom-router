import {
  $state,
  components,
  html,
  RegisterComponent,
  render,
  runEffect,
  setContext,
  useAsync,
  useInsert
} from "pawajs"
import { RouteReader } from "../routeReader"
import { pawaWayRemover } from "pawajs/utils"
import { RadixRouter } from "./radix"
import { loadRouteData, runGuards } from "./Fetcher"
const AccessDeniedPage=()=>{
  return html `
    <div>Access denied</div>
  `
}
// ------------------------------------------------------------
// Route definitions (move this to a separate routes.js later)
// ------------------------------------------------------------
let allRoutes=[]
export const setRoute=(array)=>{
  allRoutes=array 
  entry()
}
// ------------------------------------------------------------
// Core maps & radix
// ------------------------------------------------------------
export const layoutMap = new Map()
const notFoundMap = new Map()
export const routesArray = []
export const radix = new RadixRouter()
const generalNotFound = {}

const isAbortError = (error) => error?.name === "AbortError"

let historyPatched = false

// ------------------------------------------------------------
// Build maps + radix tree
// ------------------------------------------------------------
const regulateMaps = (route, layout = []) => {
  if (route?.layout) {
    const pageLayout = [...layout, route.name]

    layoutMap.set(route.name, {
      name: route.name,
      guard: route.guard,
      page: route.page,
      notfound: "",
      layoutChain: pageLayout,
      paths: []
    })

    if (route.children) {
      for (const child of route.children) {
        regulateMaps(child, pageLayout)
      }
    }
    return
  }

  if (route?.notfound) {
    if (layout.length > 0) {
      const layoutName = layout[layout.length - 1]
      const entry = layoutMap.get(layoutName)
      if (entry) entry.notfound = route.name
      notFoundMap.set(route.name, { name: route.name, page: route.page })
    } else {
      generalNotFound.name = route.name
      generalNotFound.page = route.page
    }
    return
  }

  // Leaf route
  const routeData = {
    name: route.name,
    page: route.page,
    guard: route.guard,
    layout: layout || [],
    path: route.route
  }

  routesArray.push(routeData)
  radix.insert(route.route, routeData)

  if (layout?.length) {
    for (const layoutName of layout) {
      layoutMap.get(layoutName)?.paths.push(route.route)
    }
  }
}

 const entry = () => {
  for (const route of allRoutes) {
    regulateMaps(route)
  }
}


// ------------------------------------------------------------
// Public match helper
// ------------------------------------------------------------
export const matchRoute = (path) => {
  const [ok, params, routeData, query] = radix.match(path)
  return [ok, params, query, routeData]
}

// ------------------------------------------------------------
// History patching
// ------------------------------------------------------------
function enhanceHistoryAPI() {
  if (historyPatched) return
  historyPatched = true

  const dispatch = () => window.dispatchEvent(new Event("pushchange"))

  const originalPush = history.pushState
  const originalReplace = history.replaceState

  history.pushState = function (...args) {
    originalPush.apply(this, args)
    dispatch()
  }

  history.replaceState = function (...args) {
    originalReplace.apply(this, args)
    dispatch()
  }

  window.addEventListener("popstate", dispatch)
}

// ------------------------------------------------------------
// Tree comparison
// ------------------------------------------------------------
const compareTree = (oldTree = [], newTree = []) => {
  let thisSame = true
  let changedOldKey = null
  let fromNewKey = null

  for (const key in newTree) {
    if (!thisSame) break
    if (oldTree[key]?.name !== newTree[key]?.name) {
      thisSame = false
      fromNewKey = key
      changedOldKey = oldTree[key] || null
    }
  }

  return { thisSame, fromNewKey, changedOldKey }
}

// ------------------------------------------------------------
// Nearest 404
// ------------------------------------------------------------
const findNearestNotFound = (path) => {
  let best = null
  let bestDepth = -1

  for (const entry of layoutMap.values()) {
    if (!entry.notfound) continue
    const depth = entry.layoutChain?.length ?? 0
    if (depth > bestDepth) {
      best = entry
      bestDepth = depth
    }
  }
  return best
}

// ------------------------------------------------------------
// Context + global state
// ------------------------------------------------------------
export const routeContext = setContext()
export const isRoute = $state({
  loading: false,
  failed: false,
  msg: ""
})
const routeControl=new Map()
// ------------------------------------------------------------
// Main Router component
// ------------------------------------------------------------
export const Router = async () => {
  const { $async } = useAsync()

  const loadData = $state({})
  const intercept = $state(false)
  const route = $state(window.location.pathname + window.location.search)
  const retry = $state(false)
  const routeNames = $state([])

  let liveComponents = []
  let oldTree = []
  let enter = false
  let currentAbort = null

  const routeInstance = {
    current: [],
    intercept: [],
    parallel: []
  }

  const componentRemover = { remove: null }

  const createErrorTree = (error) => {
    const message = error?.message || "Failed to load page"
    const RouteError = () => {
      useInsert({ retry, message })
      return html `
        <div class="route-error" role="alert">
          <h1>Unable to load this page</h1>
          <p>@{message}</p>
          <button on-click="retry.value = !retry.value">Try again</button>
          <a href="/" route-link>Go home</a>
        </div>
      `
    }

    return [{
      page: async () => ({ RouteError }),
      name: "route-error",
      type: "route",
      path: ""
    }]
  }

  const removeFromLive = (name) => {
    liveComponents = liveComponents.filter((r) => r.name !== name)
  }

  routeContext.setValue({
    componentRemover,
    route,
    routeInstance,
    routeControl,
    retry,
    routesArray,
    layoutMap,
    removeFromLive,
    loadData,
    intercept,
    routeNames
  })

  // History listener
  runEffect(() => {
    enhanceHistoryAPI()
    const handler = () => {
      route.value = window.location.pathname + window.location.search
    }
    window.addEventListener("pushchange", handler)
    return () => window.removeEventListener("pushchange", handler)
  })

  // ---------- Core navigation logic ----------
  const buildTree = () => {
    const [matched, params, query, matcher] = matchRoute(route.value)
    let routeTree = []
    let lastTree = oldTree
    let isIntercepted = false

    if (matched && matcher) {
      // Layouts
      if (matcher.layout?.length) {
        for (const name of matcher.layout) {
          const layout = layoutMap.get(name)
          if (layout) {
            routeTree.push({
              page: layout.page,
              name: layout.name,
              type: "layout",
              path: ""
            })
          }
        }
      }

      // Page
      routeTree.push({
        page: matcher.page,
        name: matcher.name,
        type: "route",
        path: matcher.path
      })

      // Intercept / parallel (kept simple for now)
      if (routeInstance.current[0]?.name !== routeTree[0]?.name) {
        routeInstance.current = [routeTree[0]]
        routeInstance.intercept = []
        routeInstance.parallel = []
      }
    } else {
      // 404
      const nearest = findNearestNotFound(route.value)
      if (nearest) {
        for (const layoutName of nearest.layoutChain) {
          const layout = layoutMap.get(layoutName)
          if (layout) {
            routeTree.push({
              page: layout.page,
              name: layout.name,
              type: "layout",
              path: ""
            })
          }
        }
        const nf = notFoundMap.get(nearest.notfound)
        if (nf) {
          routeTree.push({
            page: nf.page,
            name: nf.name,
            type: "route",
            path: ""
          })
        }
      } else if (generalNotFound.page) {
        routeTree.push({
          page: generalNotFound.page,
          name: generalNotFound.name,
          type: "route",
          path: ""
        })
      } else {
        routeTree.push({
          page: null,
          name: "failed",
          type: "route",
          path: ""
        })
      }
    }

    const compared = compareTree(lastTree, routeTree)
    return { routeTree, compared, isIntercepted, params, query }
  }

  const startAppRoute = async () => {
    // Cancel previous in-flight loaders
    if (currentAbort) currentAbort.abort()
    currentAbort = new AbortController()

    const { routeTree, compared, isIntercepted, params, query } = buildTree()

    let data
    let guards
    let guardResult
    const navigate = (url) => history.pushState({}, "", url)

    try {
      ({ data, guards } = await loadRouteData({
        formerTree: oldTree,
        newTree: routeTree,
        path: route.value,
        params,
        query: query || Object.fromEntries(new URLSearchParams(window.location.search)),
        signal: currentAbort.signal
      }))

      guardResult = await runGuards(guards, {
        params,
        query: query || Object.fromEntries(new URLSearchParams(window.location.search)),
        path: route.value,
        data,
        navigate
      })
    } catch (error) {
      if (isAbortError(error)) throw error

      const errorTree = createErrorTree(error)
      const compared = compareTree(oldTree, errorTree)
      oldTree = errorTree
      routeNames.value = errorTree.map((item) => item.name)
      isRoute.value = {
        loading: false,
        failed: true,
        msg: error?.message || "Failed to load page"
      }
      console.error("Route navigation failed:", error)
      return { routeTree: errorTree, compared, isIntercepted: false, failed: true }
    }

    // Merge loader data
    loadData.value = { ...loadData.value, ...data }

    let finalTree = routeTree

    if (!guardResult.allowed) {
      if (guardResult.redirect) {
        navigate(guardResult.redirect)
        return { routeTree: [], compared, isIntercepted: false }
      }

      // Access denied fallback
      finalTree = [{
        page: async () => ({ AccessDeniedPage }),
        name: "access-denied",
        type: "route",
        path: ""
      }]
    }

    oldTree = finalTree
    routeNames.value = finalTree.map((r) => r.name)

    return { routeTree: finalTree, compared, isIntercepted }
  }

  // ---------- Mount + reactive navigation ----------
  const setup = (el) => {
    const reader = document.createElement("route-reader")
    reader.setAttribute(":tree", "tree")
    reader.setAttribute(":index", "0")

    runEffect(async () => {
      if (!enter) {
        enter = true
        return
      }

      try {
        isRoute.value = { loading: true, failed: false, msg: "" }

        const { compared, routeTree, isIntercepted, failed } = await startAppRoute()

        if (isIntercepted) {
          intercept.value = true
        }

        if (!compared?.thisSame && compared.changedOldKey) {
          const routeToBeRemoved = compared.changedOldKey
          if (!routeToBeRemoved?.name) return

          const entry = routeControl.get(routeToBeRemoved.name)
          if (!entry) return

          liveComponents = liveComponents.filter(
            (r) => r.name !== routeToBeRemoved.name
          )

          await remover(
            entry.comment,
            false,
            null,
            reader,
            compared.fromNewKey,
            componentRemover,
            routeTree,
            entry.context
          )
        }

        if (!failed) {
          isRoute.value = { loading: false, failed: false, msg: "" }
        }
      } catch (err) {
        console.error(err,err.message)
        isRoute.value = {
          loading: false,
          failed: true,
          msg: err?.message || "Failed to load page"
        }
      }
    }, [route, retry])
  }

  // Initial run
  await startAppRoute()

  $async(() => useInsert({ setup, oldTree }))

  return html `
    <main mount="setup($el)">
      <route-announcer>
        <route-reader :tree="oldTree" :index="0"></route-reader>
      </route-announcer>
    </main>
  `
}

// ------------------------------------------------------------
// DOM swap helper
// ------------------------------------------------------------
const remover = async (
  comment,
  isFailed = false,
  announcer,
  reader,
  index = 0,
  compoRemover,
  tree,
  context
) => {
  reader.setAttribute(":index", index)

  compoRemover.remove = async () => {
    await pawaWayRemover(comment, comment._endComment)
    comment._remove?.()
    comment._endComment?.remove()
  }

  const newNode = reader.cloneNode(true)

  const doSwap = async () => {
    comment.parentElement.insertBefore(newNode, comment)
    render(newNode, { ...context, tree, index })
    await compoRemover.remove?.()
  }

  if (document.startViewTransition) {
    const transition = document.startViewTransition(doSwap)
    await transition.finished
  } else {
    await doSwap()
  }
}
