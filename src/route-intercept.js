import { $state, html, runEffect, setContext, useContext, useInsert } from "pawajs"
import { matchRoute, routeContext } from "."

const routeInterceptContext=setContext()
export const RouteIntercepter=({route:paths,children})=>{
     const path=paths()
     const isActive=$state(false)
     
     const {routeInstance,routesArray,route,retry,layoutMap,intercept}=useContext(routeContext)
     const pathTree=routesArray.find(routes=>routes.path === path)
     const routeTree=[]
     if (pathTree.layout.length > 0) {
                for (const name of pathTree.layout) {
                    const layout=layoutMap.get(name)
                    routeTree.push({page:layout.page,name:layout.name,type:'layout',path:''})
                }
               }
               routeTree.push({page:pathTree.page,name:pathTree.name,type:'route',path:path})
     
     routeInterceptContext.setValue({tree:routeTree})
     useInsert({isActive})
     if (pathTree) {
        routeInstance.intercept.push(routeTree)
     }else{
        throw new Error("route path isn't registered");
     }

     runEffect(()=>{
        const [current]=matchRoute(pathTree.path,route.value)
        if (current) {
            isActive.value=true
        }else{
            isActive.value=false
        }
        return ()=>{
            intercept.value=false
        }
     },[route,retry])
        
    return html `
     <div if="isActive.value">
        ${children}
     </div>
    `
}

export const InterceptSlot=()=>{
    const {tree}=useContext(routeInterceptContext)
    // console.log(tree,'at inter slot');
    
    useInsert({tree})
    return html `<route-reader :tree="tree" :index="0"></route-reader>
    `
}