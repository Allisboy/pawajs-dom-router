import {
  $state,
  html,
  runEffect,
  useAsync,
  useContext,
  useInsert,
  useValidateComponent
} from "pawajs"
import { matchRoute, routeContext, layoutMap } from "."
import { loadRouteData, runGuards } from "./Fetcher"

export const ParallelRoute =async ({ route: targetPath }) => {
 const {$async}= useAsync()
  const {
    routeInstance,
    route,
    loadData,
    routeNames
  } = useContext(routeContext)

  let tree = []
  const localData = $state({})
  const status = $state({ loading: false, denied: false, error: null })

  let currentAbort = null
  let registeredTree = null

  const buildAndLoad = async () => {
    const path = typeof targetPath === "function" ? targetPath() : targetPath
    if (!path) {
      tree= []
      return
    }

    // Cancel any previous in-flight work
    if (currentAbort) currentAbort.abort()
    currentAbort = new AbortController()

    status.value = { loading: true, denied: false, error: null }

    try {
      // 1. Match with radix tree
      const [matched, params, query, routeData] = matchRoute(path)

      if (!matched || !routeData) {
        tree = []
        status.value = { loading: false, denied: false, error: "Route not found" }
        return
      }

      // 2. Build a minimal tree (page only – recommended for parallel slots)
      const newTree = [{
        page: routeData.page,
        name: routeData.name,
        type: "route",
        path: routeData.path
      }]
      const { data, guards } = await loadRouteData({
        formerTree: [],                 // parallel routes are independent
        newTree: newTree,
        path,
        params: params || {},
        query: query || Object.fromEntries(new URLSearchParams(
          new URL(path, window.location.origin).search
        )),
        signal: currentAbort.signal
      })

      // 4. Run guards
      const navigate = (url) => history.pushState({}, "", url)

      const guardResult = await runGuards(guards, {
        params: params || {},
        query: query || {},
        path,
        data,
        navigate
      })

      if (!guardResult.allowed) {
        if (guardResult.redirect) {
          // For parallel routes we usually just hide the slot
          // instead of forcing a navigation
          tree = []
          status.value = { loading: false, denied: true, error: null }
          return
        }

        // Access denied
        tree = []
        status.value = { loading: false, denied: true, error: null }
        return
      }

      // 5. Success – store data and render
      localData.value = data
      loadData.value = { ...loadData.value, ...data }   // merge into global store

      // Register for tracking
      if (registeredTree) {
        const idx = routeInstance.parallel.indexOf(registeredTree)
        if (idx !== -1) routeInstance.parallel.splice(idx, 1)
      }
      registeredTree = newTree
      routeInstance.parallel.push(newTree)

      tree = newTree
      status.value = { loading: false, denied: false, error: null }

    } catch (err) {
      if (err.name === "AbortError") return
      console.error("ParallelRoute error:", err)
      tree = []
      status.value = { loading: false, denied: false, error: err.message }
    }
  }

  // Initial + reactive rebuild
  runEffect(() => {
    buildAndLoad()
  }, [route, targetPath])

  // Cleanup when component is destroyed
  runEffect(() => {
    return () => {
      if (currentAbort) currentAbort.abort()

      if (registeredTree) {
        const idx = routeInstance.parallel.indexOf(registeredTree)
        if (idx !== -1) routeInstance.parallel.splice(idx, 1)
      }
    }
  })
await buildAndLoad()
$async(()=>useInsert({ tree, localData, status }))


  return html`
  <div>
    <div if="status.loading"  class="parallel-loading" >Loading...</div>
    <div else-if="status.denied" class="parallel-denied">Access denied</div>
    <div else-if="status.error"  class="parallel-error">@{status.error}</div>
    <route-reader else :tree="tree" :index="0"></route-reader>
  </div>
  `
}

useValidateComponent(ParallelRoute, {
  route: {
    strict: true,
    type: String
  }
})