import { components, html, runEffect, useAsync, useContext , RegisterComponent,useInsert, useInnerContext, setContext, $state} from "pawajs"
import { matchRoute, routeContext, routesArray, isRoute } from "."

 export const routeReaderContext=setContext() 
export const useRouter=()=>{
  const {route,routeNames}=useContext(routeContext)
  const {path,name}=useContext(routeReaderContext)
  const current=$state({param:null,query:{},route:path || window.location.pathname})
  let active=false
  const finder=(curr=undefined)=>{
    let latest=path || window.location.pathname + window.location.search
    let urlPath=''
    active=routeNames.value.includes(name)
    const [c,param,query]=matchRoute(latest)
    if (c && active) {
        current.value.param=param
        current.value.query=query
      }
      
  
  }
  finder()
  runEffect(()=>{
    finder()
  },[routeNames])
  return {current}
 }
 export const useRoute = () => {
  const ctx = useContext(routeContext)

  const current = $state({
    path: window.location.pathname,
    fullPath: window.location.pathname + window.location.search,
    param: ctx.params || {},
    query: ctx.query || {},
    push: (url) => history.pushState({}, '', url),
    replace: (url) => history.replaceState({}, '', url),
    back: () => history.back()
  })

  runEffect(() => {
    current.value = {
      path: window.location.pathname,
      fullPath: window.location.pathname + window.location.search,
      param: ctx.params || {},
      query: ctx.query || {},
      push: (url) => history.pushState({}, '', url),
      replace: (url) => history.replaceState({}, '', url),
      back: () => history.back()
    }
  }, [ctx.route, ctx.params, ctx.query])

  return { current }
}
const getPageExport = (modules) => {
  if (typeof modules?.default === "function") {
    return { name: modules.default.name || "RoutePage", page: modules.default }
  }

  const functionExports = Object.entries(modules || {}).filter(([key, value]) => {
    return key !== "loader" && key !== "guard" && typeof value === "function"
  })

  const pageExports = functionExports.filter(([key]) => key.endsWith("Page"))
  const pageEntry = pageExports.length === 1
    ? pageExports[0]
    : functionExports.length === 1
      ? functionExports[0]
      : null

  return pageEntry ? { name: pageEntry[0], page: pageEntry[1] } : null
}

const renderRouteError = (message, retry) => {
  isRoute.value = { loading: false, failed: true, msg: message }

  const ReaderError = () => {
    useInsert({ retry, message })
    return html`
      <div class="route-error" role="alert">
        <h1>Unable to load this page</h1>
        <p>@{message}</p>
        <button if="retry" on-click="retry.value = !retry.value">Try again</button>
        <a href="/" route-link>Go home</a>
      </div>
    `
  }

  const name = "RouteReaderError"
  components.set(name.toUpperCase(), ReaderError)
  return html`<${name}></${name}>`
}

export const RouteReader=async({tree,index})=>{
    const {$async}=useAsync()
    const {componentRemover,removeFromLive,route,routeControl,retry}=useContext(routeContext)
    
     const routeTree=typeof tree === "function" ? tree() : tree
     const context=useInnerContext()
     const i=typeof index === "function" ? index() : index
     const current=routeTree?.[i]

     if (!current || typeof i !== "number") {
        return renderRouteError("The router could not resolve this page.", retry)
     }
     
     const component=current.page
     const name=current.name
     let guard
     routeReaderContext.setValue({path:current?.path,name:current?.name})
    useInsert({tree:routeTree,guard})
     
            runEffect(async(comment)=>{
                routeControl.set(name, {comment:comment,context:context})   
                
                return ()=>{
                    routeControl.delete(name)
                    removeFromLive(name)
                }
            })

      if (typeof component === "string") {
        return renderRouteError("This route is not available.", retry)
      }else if (typeof component !== "function") {
      return renderRouteError("The router could not process this page.", retry)
     }
     try {
        const modules=await component()
        const pageExport=getPageExport(modules)

        if (!pageExport) {
         throw new Error("The route module does not export a page component")
        }

        const { name: newName, page } = pageExport
        
         guard=modules?.guard

        $async(()=>useInsert({guard}))
        components.set(newName.toLocaleUpperCase(), page)
                
                
        // 09050690331
        const next=i+1
        return html `
            <${newName}>
             ${routeTree[next] ? 
                 `<route-reader :tree="tree" :index="${next}"></route-reader>`:''}
            </${newName}>
        `
     } catch (error) {
        const message=error?.message || "Could not load the page"
        console.error(`RouteReader failed for ${name}:`, error)
        return renderRouteError(message, retry)
     }
     
}
