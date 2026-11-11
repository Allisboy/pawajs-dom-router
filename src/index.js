import { applyNavigation, preloadRoute, prepareNavigation, resolveNavigation, runNavigation } from "./pipeline.js";
import { navigateTo, startNavigation } from "./navigation.js";
import {
  $state,
  html,
  lazyComponents,
  RegisterComponent,
  runEffect,
  setContext,
  useContext,
  useInnerContext,
  useInsert,
  Plugin,
} from "pawajs";
import {
  getRouteDataEntry,
  loadRouteData,
  routeDataKey,
} from "./hooks.js";
import {
  createRouteTable,
  findRouteById,
  findRouteMatch,
  matchRoute,
  normalizeRouteName,
  routeIdFor,
  upsertRoute,
} from "./routing.js";
import { subscribeHistory } from "./history.js";
import { setServerMeta, setServerTitle } from "./head.js";
export { matchRoute };
export const routerContext = setContext();
const navigateFromRouter = (to, options = {}) => {
  const destination = String(to ?? "");
  
  if (!destination) return;
  
  if (typeof window === "undefined") {
    const { req } = useInnerContext() ?? {};
    if (req) req.pawaRedirect = destination;
    return;
  }
navigateTo(destination, options);
};

export const useRoute = () => {
  const router = useContext(routerContext);
  if (!router) throw new Error("useRoute must be called inside a Router");

  return {
    route: router.route,
    params: router.param,
    query: router.query,
    names: router.routeNames,
    ids: router.routeIds,
    status: router.status,
    get current() {
      return findRouteMatch(router.routeTree, router.route.value)?.route;
    },
    navigate: navigateFromRouter,
    preload: (location) => preloadRoute(router, location),
  };
};


Plugin("routeLink", (el, attr, graph, context) => {
  if (!el.tagName) return;
  startNavigation();

  const preload = () => {
    if (!el.hasAttribute("preload")) return;
    const href = el.getAttribute("href");
    if (!href || el.hasAttribute("download")) return;
    if (el.getAttribute("target") && el.getAttribute("target") !== "_self") return;
    if (el.getAttribute("rel")?.split(/\s+/).includes("external")) return;

    const url = new URL(el.href, location.href);
    if (url.origin !== location.origin) return;

    context.preloadRoute?.(`${url.pathname}${url.search}`)
      .catch((error) => console.error("Route preloading failed", error));
  };

  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const href = el.getAttribute("href");
    if (!href) return;
    if (el.hasAttribute("download")) return;

    const target = el.getAttribute("target");
    if (target && target !== "_self") return;
    if (el.getAttribute("rel")?.split(/\s+/).includes("external")) return;

    const url = new URL(el.href, location.href);
    if (url.origin !== location.origin) return;

    e.preventDefault();
    navigateTo(url, {
      replace: el.hasAttribute("replace"),
      scroll: el.getAttribute("scroll") !== "false",
    });
  };

  if (el.getAttribute("target") === "_blank") el.setAttribute("rel", "noopener");

  el.addEventListener("pointerenter", preload);
  el.addEventListener("focus", preload);
  el.addEventListener("click", onClick);
  graph.unMount.push(() => {
    el.removeEventListener("pointerenter", preload);
    el.removeEventListener("focus", preload);
    el.removeEventListener("click", onClick);
  });
});
export const useParams = () => useRoute().params;
export const useQuery = () => useRoute().query;
export const useNavigate = () => useRoute().navigate;
export const useRouteStatus = () => {
  const router = useContext(routerContext);
  if (!router) throw new Error("useRouteStatus must be called inside a Router");

  const normalizePath = (location) => {
    const pathname = new URL(String(location || "/"), "http://pawa.local").pathname;
    return pathname.replace(/\/+$/, "") || "/";
  };

  return {
    get current() {
      return router.status.value === "pending";
    },
    onload(path) {
      return router.status.value === "pending"
        && normalizePath(router.pendingLocation.value) === normalizePath(path);
    },
  };
};


export const Router = ({ url }) => {
  const route = $state(url?.() || (typeof window !== "undefined"
    ? window.location.pathname + window.location.search : "/"));
  const query = $state({});
  const param = $state({});
  const routeNames = $state([]);
  const routeIds = $state([]);
  const status = $state("idle");
  const pendingLocation = $state("");

  const router = {
    route, query, param, routeNames, routeIds, status, pendingLocation,
    routeTree: createRouteTable(),
    routeData: {},
    version: 0,
  };
  routerContext.setValue(router);
  useInsert({ preloadRoute: (location) => preloadRoute(router, location) });

  runEffect(() => {
    const pop = () => {
      const next = window.location.pathname + window.location.search;
      if (next !== route.value) route.value = next;
    };
    return subscribeHistory(window, pop);
  }, 0);

  let first = true;
  let transit;
  runEffect(() => {
    if (first) { first = false; return; }   // the first navigation belongs to RouteReader
    router.status.value = "pending";
    router.pendingLocation.value = route.value;

    runNavigation(router, route.value).then((nav) => {
      if (nav.version !== router.version) return;           // superseded while loading
      if (nav.status === "redirect") {
        return navigateFromRouter(nav.to, { replace: true }); // changes route.value, effect re-runs
      }
      const commit = () => {
        applyNavigation(router, nav);
        window.dispatchEvent(new Event("pawa:routed"));
      };
      transit?.skipTransition?.();
      transit = document.startViewTransition ? document.startViewTransition(commit) : (commit(), null);
    });
  }, [() => route.value]);

  return html`
  <template>
    <slot></slot>
    <routeReader></routeReader>
  </template>`;
};
 const routeContext = setContext();
export const Route = ({ path, name, preload, lazy, layout, guard, updateData }) => {
  let parent = [];
  let parentRouteIds = [];
  let inheritPath = "";
  const router = useContext(routerContext);

  try {
    const ctx = useContext(routeContext);
    parent = [...ctx.names];
    parentRouteIds = [...ctx.routeIds];
    inheritPath = ctx.paths;
  } catch (_) {}

  inheritPath += path();

  let CompoLazy = null;
  if (lazy?.() && name?.()) {
    CompoLazy = lazyComponents.get(name().toUpperCase());
  }

  const routeName = normalizeRouteName(name?.() ?? "");
  parent.push(routeName);
  const routeId = routeIdFor(inheritPath, routeName);
  const routeIds = [...parentRouteIds, routeId];
  const routeTree = router.routeTree;

  const routeRecord = {
    id: routeId,
    name: routeName,
    layout: !!layout?.(),
    path: inheritPath,
    preload: preload?.() ?? null,
    guard: guard?.() ?? null,
    updateData: updateData?.() ?? false,
    lazy: CompoLazy,
    routeNames: [...parent],
    routeIds,
  };
  upsertRoute(routeTree, routeRecord);

  routeContext.setValue({
    names: [...parent],
    paths: inheritPath,
    routeIds,
  });

  if (layout?.()) {
    return html`<template><slot></slot></template>`;
  }

  return "";
};
const Navigate = ({ url, replace }) => {
  
  navigateFromRouter(url(), { replace: replace?.() ?? false });
  return "";
};
const resolveProp = (prop) => typeof prop === "function" ? prop() : prop;
export const RouteTitle = ({ value, title, text }) => {
  let nextTitle = resolveProp(value ?? title ?? text) ?? "";
  const { req } = useInnerContext() ?? {};
  
  if (typeof window === "undefined") {
    setServerTitle(req, nextTitle);
  } else {
    document.title = String(nextTitle);
  }
  runEffect(()=>{
    nextTitle=resolveProp(value ?? title ?? text) ?? ''
    document.title=String(nextTitle)
  },{})
  return "";
};
export const MetaTag = ({ name, property, content, httpEquiv, charSet, charset }) => {
  let attr = {
    name: resolveProp(name),
    property: resolveProp(property),
    content: resolveProp(content),
    "http-equiv": resolveProp(httpEquiv),
    charset: resolveProp(charset ?? charSet),
  };
  let el
  const { req } = useInnerContext() ?? {};
const client=(attributes)=>{
      const identity = ["name", "property", "http-equiv", "charset"]
      .find((key) => attributes[key] !== undefined && attributes[key] !== "");
    if (!identity) return "";
    const existing = Array.from(document.head.querySelectorAll("meta"))
      .find((meta) => meta.getAttribute(identity) === String(attributes[identity]));
    const element = existing ?? document.createElement("meta");
    for (const [key, attributeValue] of Object.entries(attributes)) {
      if (attributeValue !== undefined && attributeValue !== null && attributeValue !== "") {
        element.setAttribute(key, String(attributeValue));
      }
    }
    el=element
    if (!existing) document.head.append(element);

}
  if (typeof window === "undefined") {
    setServerMeta(req, attr);
  } else {
    client(attr)
  }
  runEffect(()=>{
    return ()=>{
      if (el) {
        el.remove()
      }
    }
  })
  runEffect(()=>{
     attr = {
    name: resolveProp(name),
    property: resolveProp(property),
    content: resolveProp(content),
    "http-equiv": resolveProp(httpEquiv),
    charset: resolveProp(charset ?? charSet),
  };
  client(attr)
  
  },{})
  return "";
};
const RouteReader = () => {
  const router = useContext(routerContext);
  const nav = prepareNavigation(router, router.route.value);
  const start = async () => {
    const result = await resolveNavigation(router, nav);
    if (!applyNavigation(router, result)) return { status: "superseded" };
    return result;
  };

  const { routeIds, routeNames } = router;
  useInsert({ start, routeIds, routeNames });
  return html
  `
    <template await="start" as="result" no-stream>
      <template if="result.status === 'redirect'">
        <navigate :url="result.to" :replace="true"></navigate>
      </template>
      <template if="result.status === 'ok' || (result.status === 'notfound' && routeIds.value.length)">
        <route-view key="routeIds.value[0]" :route-id="routeIds.value[0]" :name="routeNames.value[0]" :index="0"></route-view>
      </template>
      <template if="result.status === 'blocked'">
        <div>Navigation blocked</div>
      </template>
      <template if="result.status === 'error'">
        <div>Unable to resolve route</div>
      </template>
    </template>
    <template as-catch>
      <div>Unable to resolve route</div>
    </template>
  `
  ;
};

const routeViewContext=setContext()
export const useRouteData=(_preload)=>{
  const ctx=useContext(routeViewContext)
  const router=ctx.router
  const key=routeDataKey(router.param.value,router.query.value)
  const entry=getRouteDataEntry(router.routeData,ctx.routeId)
  
  const data=$state(async()=>{
    const cached = entry.cache.get(key);
    if (cached?.loaded) {
      return cached.data;
    }else if (entry.loaded && entry.key === key) {
      return entry.data;
    }else{
      return await ctx.preloadRoute()
    }
  },ctx.routeId)
  const update=(newData,dataKey=entry.key)=>{
    entry.data=newData
    entry.key=dataKey
    entry.loaded=true
    const cache=entry.cache.get(dataKey)
    if (cache) {
      cache.data=newData
      cache.loaded=true
    }
    if (routeDataKey(router.param.value,router.query.value)===dataKey) data.value=newData
  }
  const setData=(newData)=>{
     data.value=newData
  }
  entry.update=update
  entry.setData=setData
  runEffect(()=>{
    return ()=>{
      if (entry?.update===update) entry.update=null
      if (entry?.setData===setData) entry.setData=null
      if(router.routeData[ctx.routeId]?.data ) router.routeData[ctx.routeId].data=null 
    }
  })
  const reload=async()=>{
    const dat=await ctx.preloadRoute(true)
    return dat
  }
  const clearCache=(string)=>{
    if (string) {
      entry.cache.delete(string)
    }else{
      entry.cache.clear()
    }
  }
  return {data,reload,clearCache}
}
const RouteView =async ({ name, routeId, index }) => {
  const router = useContext(routerContext);
  const { routeNames, routeIds, routeTree } = router;
  const routes = findRouteById(routeTree, routeId());
  const layout = routes?.layout;
  const next = () => routeNames.value[index() + 1];
  const preloadRoute = (force = false) =>
    loadRouteData(routes, router, routes.routeNames, force);
  routeViewContext.setValue({preloadRoute,routeId:routeId(),name:name(),router}) 
  
  const routeView = `<${name()}>
    ${layout && routeIds.value[index() + 1] ? `<route-view key="routeIds.value[${index() + 1}]" :route-id="routeIds.value[${index() + 1}]" :name="routeNames.value[${index() + 1}]" :index="${index() + 1}"></route-view>` : ""}
  </${name()}>`;
  
  useInsert({ routeNames, next, preloadRoute, routeIds });
  return routeView;
};

RegisterComponent("RouteReader",RouteReader,"RouteView", RouteView, "Navigate",Navigate, "RouteTitle",RouteTitle, "MetaTag",MetaTag);
