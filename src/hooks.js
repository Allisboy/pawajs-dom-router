
export const routeDataKey = (param = {}, query = {}) => JSON.stringify([
  Object.entries(param).sort(([left], [right]) => left.localeCompare(right)),
  Object.entries(query).sort(([left], [right]) => left.localeCompare(right)),
]);

export function getRouteDataEntry(routeData, name) {
  const entry = routeData[name] ?? (routeData[name] = {
    data: undefined,
    update: null,
    setData: null,
    loaded: false,
    key: null,
    cache: new Map(),
  });
  entry.cache ??= new Map();
  return entry;
}

export function storeRouteData(routeData, routeId, data, key = "", updateData = false, notify = true) {
  const entry = getRouteDataEntry(routeData, routeId);
  const cached = entry.cache.get(key) ?? { data: undefined, loaded: false, promise: null };
  Object.assign(cached, { data, loaded: true, promise: null });
  entry.cache.set(key, cached);
  if (!notify) return data;                 // stale: cache only
  entry.data = data; entry.key = key; entry.loaded = true;
  if (updateData && typeof entry.update === "function") entry.update(data, key);
  else entry.setData?.(data, key);
  return data;
}
export async function resolveGuard(matched, ctx, routeTree) {
  for (const name of matched.routeNames) {
    const route = routeTree.find((item) => item.name === name);
    if (!route?.guard) continue;

    const component = typeof route.guard === "function" || !route.lazy
      ? null
      : await route.lazy.component();
    const guard = typeof route.guard === "function" ? route.guard : component?.guard;
    if (typeof guard !== "function") continue;

    const result = await guard({
      route: ctx.route.value,
      param: ctx.param.value,
      query: ctx.query.value,
      routeNames: matched.routeNames,
    });

    if (result === false) return { blocked: true };
    if (typeof result === "string") return { redirect: result };
  }
}

export async function resolveRoutePreload(route, ctx, routeNames) {
  if (!route?.preload) return undefined;

  const component = typeof route.preload === "function" || !route.lazy
    ? null
    : await route.lazy.component();
  const preload = typeof route.preload === "function" ? route.preload : component?.preload;
  if (typeof preload !== "function") return undefined;

  return await preload({
    route: ctx.route.value,
    param: ctx.param.value,
    query: ctx.query.value,
    routeNames,
  });
}

export function loadRouteData(route, ctx, routeNames, force = false, notify = true) {
  if (!route?.preload) return Promise.resolve(undefined);

  const key = routeDataKey(ctx.param.value, ctx.query.value);
  const entry = getRouteDataEntry(ctx.routeData, route.id);
  const cached = entry.cache.get(key) ?? { data: undefined, loaded: false, promise: null };
  entry.cache.set(key, cached);
  if (!force && cached.loaded) {
    storeRouteData(ctx.routeData, route.id, cached.data, key, route.updateData, notify);
    return Promise.resolve(cached.data);
  }
  if (!force && cached.promise) return cached.promise;

  let pending;
  pending = resolveRoutePreload(route, ctx, routeNames).then((data) => {
    if (cached.promise === pending) {
      storeRouteData(ctx.routeData, route.id, data, key, route.updateData, notify);
    }
    return data;
  }).catch((error) => {
    if (cached.promise === pending) cached.promise = null;
    throw error;
  });
  cached.promise = pending;
  return pending;
}
