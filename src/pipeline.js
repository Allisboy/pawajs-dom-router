import { findNotFoundRoute, findRouteById, findRouteMatch, parseLocation } from "./routing.js";
import { loadRouteData, routeDataKey, storeRouteData } from "./hooks.js";

export const prepareNavigation = (router, location, publishRouteState = false) => {
  const version = ++router.version;
  const matchedRoute = findRouteMatch(router.routeTree, location);
  const isNotFound = !matchedRoute;
  const matched = matchedRoute ?? findNotFoundRoute(router.routeTree, location);
  const { query } = parseLocation(location);
  const params = matched?.params ?? {};
  const nav = {
    version,
    location,
    status: matched ? "pending" : "notfound",
    matched,
    params,
    query,
    isNotFound,
  };

  if (publishRouteState) {
    router.param.value = params;
    router.query.value = query;
    router.routeNames.value = matched ? [...matched.routeNames] : [];
    router.routeIds.value = matched ? [...matched.routeIds] : [];
    router.pendingLocation.value = location;
    router.status.value = nav.status;
  }

  return nav;
};

export const resolveNavigation = async (router, nav) => {
  if (!nav.matched) return nav;

  const { version, location, matched, params, query, isNotFound } = nav;
  // Same shape hooks.js already expects, but a snapshot. Nothing here reads
  // live signals, so a newer navigation can't change it mid-flight.
  const ctx = {
    route: { value: location },
    param: { value: params },
    query: { value: query },
    routeData: router.routeData,
  };
  const hookArgs = { route: location, param: params, query, routeNames: matched.routeNames, routeIds: matched.routeIds };
  const routes = matched.routeIds
    .map((id) => findRouteById(router.routeTree, id))
    .filter(Boolean);

  try {
    // 1. Lazy modules, in parallel
    await Promise.all(routes.map((r) => r.lazy?.component?.()));

    // 2. Guards, parent first, stop at the first block or redirect
    for (const r of routes) {
      if (!r.guard) continue;
      const guard = typeof r.guard === "function"
        ? r.guard
        : (await r.lazy?.component?.())?.guard;
      if (typeof guard !== "function") continue;
      const result = await guard(hookArgs);
      if (result === false) return { version, status: "blocked" };
      if (typeof result === "string") return { version, status: "redirect", to: result };
    }

    // 3. Data, in parallel, cached but not published (notify = false)
    const key = routeDataKey(params, query);
    const data = await Promise.all(
      routes.filter((r) => r.preload).map(async (r) => ({
        id: r.id,
        key,
        updateData: r.updateData,
        value: await loadRouteData(r, ctx, matched.routeNames, false, false),
      })),
    );

    return { version, status: isNotFound ? "notfound" : "ok", matched, params, query, data };
  } catch (error) {
    console.error("Navigation failed", error);
    return { version, status: "error", error };
  }
};

export const runNavigation = async (router, location) =>
  resolveNavigation(router, prepareNavigation(router, location));

export const preloadRoute = async (router, location) => {
  const matched = findRouteMatch(router.routeTree, location)
    ?? findNotFoundRoute(router.routeTree, location);
  if (!matched) return undefined;

  const { query } = parseLocation(location);
  const ctx = {
    route: { value: location },
    param: { value: matched.params },
    query: { value: query },
    routeData: router.routeData,
  };
  const routes = matched.routeIds
    .map((id) => findRouteById(router.routeTree, id))
    .filter(Boolean);

  await Promise.all(routes.map((route) => route.lazy?.component?.()));
  await Promise.all(
    routes.filter((route) => route.preload).map((route) =>
      loadRouteData(route, ctx, matched.routeNames, false, false),
    ),
  );

  return matched;
};

export const applyNavigation = (router, nav) => {
  if (nav.version !== router.version) return false; // superseded

  router.pendingLocation.value = "";
  router.status.value = nav.status;
  switch (nav.status) {
    case "ok":
    case "notfound":
      if (!nav.matched) {
        router.routeNames.value = [];
        router.routeIds.value = [];
        break;
      }
      // Order matters: useRouteData's update() compares the key against
      // router.param/query, so those must be current before data is stored.
      router.param.value = nav.params;
      router.query.value = nav.query;
      for (const d of nav.data) {
        storeRouteData(router.routeData, d.id, d.value, d.key, d.updateData);
      }
      router.routeNames.value = [...nav.matched.routeNames];
      router.routeIds.value = [...nav.matched.routeIds];
      break;
    case "blocked":
      router.routeNames.value = [];
      router.routeIds.value = [];
      break;
    // "redirect": leave the screen alone, the caller navigates
    // "error": keep the previous page, status tells the UI
  }
  return true;
};