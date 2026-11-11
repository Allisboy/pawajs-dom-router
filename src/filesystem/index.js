import { components,  useContext } from "pawajs"
import {  routerContext } from "../index.js"
import { normalizeRouteName } from "../routing.js"


const dynamic=(compo,name)=>{
    return async ()=>{
          const temp=await compo()
        components.set(name.toUpperCase(), temp?.default)
        
         return `
         <${name}><slot></slot></${name}>
         `
    }
}

export const FileRouter=({routes})=>{
    const router=useContext(routerContext)
    const routesEntry=routes() ?? []
    

    const setup=(entry,parentPath='',parentId=null)=>{

        for (const r of entry) {
            const mainName=normalizeRouteName(r.name ?? (r.path.slice(1) + 'index')).replaceAll('-','').trim()
            const name=mainName+'default'
            const path=parentPath ? parentPath + r.path : r.path
            const id=`${encodeURIComponent(path)}::${encodeURIComponent(name)}`
            const tree={
                name:name,
                lazy:r,
                id:id,
                parentId:parentId,
                path:path,
                preload:r.preload,
                guard:r.guard,
                layout:r.layout,
            }
                const compo=dynamic(r.component,mainName)
                components.set(name.toUpperCase(),compo)  
            router.routeTree.push(tree)
            if (r.children?.length) {
               setup(r.children,path,id)
            }
        }
    }
    setup(routesEntry)
       
    return ''
}