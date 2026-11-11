const decodePathPart = (part) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

export const parseLocation = (value = "/") => {
  const location = new URL(String(value || "/"), "http://pawa.local");
  return {
    pathname: location.pathname,
    query: Object.fromEntries(location.searchParams.entries()),
  };
};

export const matchRoute = (pattern, path) => {
  const patternParts = String(pattern).split("/").filter(Boolean);
  const pathParts = parseLocation(path).pathname.split("/").filter(Boolean).map(decodePathPart);
  const params = {};

  for (let index = 0; index < patternParts.length; index++) {
    const part = patternParts[index];

    if (part.startsWith(":...") || part.startsWith("*")) {
      const paramName = part.startsWith("*") ? part.slice(1) : part.slice(4);
      params[paramName] = pathParts.slice(index).join("/");
      return [true, params];
    }

    if (pathParts[index] === undefined) return [false, {}];

    if (part.startsWith(":")) {
      params[part.slice(1)] = pathParts[index];
    } else if (decodePathPart(part) !== pathParts[index]) {
      return [false, {}];
    }
  }

  return [patternParts.length === pathParts.length, params];
};

const getRouteLineage = (route, routeTree) => {
  const lineage = [];
  let current = route;
  while (current) {
    lineage.unshift(current);
    current = current.parentId
      ? routeTree.find((item) => item.id === current.parentId)
      : null;
  }

  if (lineage.length === 1) {
    return {
      routeIds: route.routeIds ?? [route.id],
      routeNames: route.routeNames ?? [route.name],
    };
  }

  return {
    routeIds: lineage.map((item) => item.id),
    routeNames: lineage.map((item) => item.name),
  };
};

export const findRouteMatch = (routeTree, location) => {
  const { pathname } = parseLocation(location);
  const pathLength = pathname.split("/").filter(Boolean).length;
  let bestMatch;
  let bestScore;

  for (const route of routeTree) {
    const [matched, params] = matchRoute(route.path, pathname);
    if (!matched) continue;

    const parts = String(route.path).split("/").filter(Boolean);
    const splatCount = parts.filter((part) => part.startsWith("*") || part.startsWith(":...")).length;
    const staticCount = parts.filter((part) => !part.startsWith(":") && !part.startsWith("*")).length;
    const exact = splatCount === 0 && parts.length === pathLength ? 1 : 0;
    const lineage = getRouteLineage(route, routeTree);
    const score = [staticCount, exact, parts.length - splatCount, lineage.routeIds.length];
    const outranks = !bestScore || score.some((value, index) => {
      if (value === bestScore[index]) return false;
      return value > bestScore[index] && score.slice(0, index).every((prior, priorIndex) => prior === bestScore[priorIndex]);
    });

    if (outranks) {
      bestMatch = { route, params, ...lineage };
      bestScore = score;
    }
  }

  return bestMatch;
};

export const findNotFoundRoute = (routeTree, location) => {
  const pathParts = parseLocation(location).pathname.split("/").filter(Boolean);
  let bestMatch;
  let bestScore;

  for (const route of routeTree) {
    const routeParts = parseLocation(route.path).pathname.split("/").filter(Boolean);
    if (routeParts.at(-1) !== "404") continue;

    const parentParts = routeParts.slice(0, -1);
    if (parentParts.length > pathParts.length) continue;

    const parentPath = `/${parentParts.join("/")}`;
    const locationPrefix = `/${pathParts.slice(0, parentParts.length).join("/")}`;
    const [matches, params] = matchRoute(parentPath, locationPrefix);
    if (!matches) continue;

    const staticCount = parentParts.filter((part) => !part.startsWith(":") && !part.startsWith("*")).length;
    const score = [parentParts.length, staticCount];
    const outranks = !bestScore || score.some((value, index) => {
      if (value === bestScore[index]) return false;
      return value > bestScore[index] && score.slice(0, index).every((prior, priorIndex) => prior === bestScore[priorIndex]);
    });

    if (outranks) {
      bestMatch = { route, params, ...getRouteLineage(route, routeTree) };
      bestScore = score;
    }
  }

  return bestMatch;
};

export const createRouteTable = () => [];

export const upsertRoute = (routeTree, routeRecord) => {
  const existing = routeTree.find((route) => route.id === routeRecord.id);
  if (existing) {
    Object.assign(existing, routeRecord);
    return existing;
  }
  routeTree.push(routeRecord);
  return routeRecord;
};

export const findRouteById = (routeTree, id) => routeTree.find((route) => route.id === id);

export const normalizeRouteName = (name) =>
  String(name).replace(/-?404(?=$|[-/])/g, "notfound");

export const routeIdFor = (path, name) => `${encodeURIComponent(path)}::${encodeURIComponent(name)}`;