import type { ContextHandle, State } from "pawajs";

/** Pawajs component props may be passed as values or zero-argument getters. */
export type MaybeGetter<T> = T | (() => T);
export type PropGetter<T> = () => T;
export type ReactiveState<T> = State<T>;
export type RouteParams = Record<string, string>;
export type RouteQuery = Record<string, string>;
export type RouteStatus =
  | "idle"
  | "pending"
  | "ok"
  | "notfound"
  | "blocked"
  | "redirect"
  | "error";

/** A route component registered under the route's `name`. */
export type RouteComponent<Props extends object = Record<string, unknown>> =
  (props: Props) => unknown | Promise<unknown>;

/** Context passed to route guard and preload callbacks. */
export interface RouteHookContext<
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery
> {
  /** Current pathname and query string. */
  route: string;
  /** Parameters extracted from the matched route. */
  param: Params;
  /** Parsed query parameters. */
  query: Query;
  /** Names of the matched route and its parent layouts. */
  routeNames: string[];
  /** IDs of the matched route and its parent layouts, when available. */
  routeIds?: string[];
}

export type RouteGuardResult = boolean | string | void;

/** Return false to deny navigation, or a URL string to redirect. */
export type RouteGuard<
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery
> = (
  context: RouteHookContext<Params, Query>
) => RouteGuardResult | Promise<RouteGuardResult>;

/** Loads route data before rendering the route. */
export type RoutePreload<
  Data = unknown,
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery
> = (
  context: RouteHookContext<Params, Query>
) => Data | Promise<Data>;

/** Resolves either a preload callback or a data type to its preload data type. */
export type RouteDataOf<PreloadOrData> =
  PreloadOrData extends (...args: any[]) => infer Result
    ? Awaited<Result>
    : PreloadOrData;

/** Route record currently registered in the router. */
export interface RouteRecord<
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery
> {
  id: string;
  name: string;
  path: string;
  parentId?: string | null;
  routeNames?: string[];
  routeIds?: string[];
  layout: boolean;
  preload?: RoutePreload<any, Params, Query> | boolean | null;
  guard?: RouteGuard<Params, Query> | boolean | null;
  updateData?: boolean;
  lazy?: {
    component: () => Promise<unknown>;
    [key: string]: unknown;
  } | null;
}

/** Flat route table used internally by the router. */
export type RouteTree = RouteRecord[];

export interface RouterContext {
  route: State<string>;
  param: State<RouteParams>;
  query: State<RouteQuery>;
  routeNames: State<string[]>;
  routeIds: State<string[]>;
  status: State<RouteStatus>;
  pendingLocation: State<string>;
  routeTree: RouteTree;
  routeData: Record<string, unknown>;
  version: number;
}

export interface RouterProps {
  /** Optional initial URL; defaults to the current browser URL or `/` on the server. */
  url?: PropGetter<string>;
}

/** Props for the declarative route registration component. */
export interface RouteProps<
  Data = unknown,
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery
> {
  path: PropGetter<string>;
  name: PropGetter<string>;
  layout?: PropGetter<boolean>;
  lazy?: PropGetter<boolean>;
  preload?: PropGetter<RoutePreload<Data, Params, Query> | boolean | null | undefined>;
  guard?: PropGetter<RouteGuard<Params, Query> | boolean | null | undefined>;
  updateData?: PropGetter<boolean>;
  children?: unknown;
}

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Scroll to a URL hash or to the top after navigation. */
  scroll?: boolean;
}

export type Navigate = (to: string | URL, options?: NavigateOptions) => void;

export interface UseRouteResult<
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery
> {
  /** Current pathname and query string. */
  route: State<string>;
  /** Parameters extracted from the active route. */
  params: State<Params>;
  /** Parsed query parameters. */
  query: State<Query>;
  /** Active route and layout names. */
  names: State<string[]>;
  /** Active route and layout IDs. */
  ids: State<string[]>;
  /** Current navigation status. */
  status: State<RouteStatus>;
  /** The best matching route record, if one is active. */
  readonly current: RouteRecord<Params, Query> | undefined;
  /** Navigates to a URL. */
  navigate: Navigate;
  /** Preloads matched route modules and data without running guards or navigating. */
  preload(location: string | URL): Promise<RouteMatch<Params, Query> | undefined>;
}

export interface RouteMatch<
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery
> {
  route: RouteRecord<Params, Query>;
  params: Params;
  routeIds: string[];
  routeNames: string[];
}

export interface UseRouteStatusResult {
  /** True while any client-side navigation is pending. */
  readonly current: boolean;
  /** True while the given destination pathname is pending. */
  onload(path: string | URL): boolean;
}

export interface UseRouteDataResult<Data = unknown> {
  /** Reactive data loaded by the active route's preload hook. */
  data: State<Data | undefined>;
  /** Re-runs the active route's preload hook, bypassing its cache. */
  reload(): Promise<Data | undefined>;
  /** Clears one cached entry, or the complete cache when omitted. */
  clearCache(key?: string): void;
}

export interface RouteTitleProps {
  value?: MaybeGetter<string | number | null | undefined>;
  title?: MaybeGetter<string | number | null | undefined>;
  text?: MaybeGetter<string | number | null | undefined>;
}

export interface MetaTagProps {
  name?: MaybeGetter<string | null | undefined>;
  property?: MaybeGetter<string | null | undefined>;
  content?: MaybeGetter<string | null | undefined>;
  httpEquiv?: MaybeGetter<string | null | undefined>;
  charSet?: MaybeGetter<string | null | undefined>;
  charset?: MaybeGetter<string | null | undefined>;
}

/** Context handle shared with route components rendered under the router. */
export declare const routerContext: ContextHandle<RouterContext>;

/** Root router component. Register it with Pawajs and place routes inside it. */
export declare const Router: RouteComponent<RouterProps>;

/** Registers a route or layout beneath its parent route. */
export declare const Route: RouteComponent<RouteProps>;

/** Sets the document title on the client or adds it to the server request head. */
export declare const RouteTitle: RouteComponent<RouteTitleProps>;

/** Adds or updates a document meta tag on the client or server. */
export declare const MetaTag: RouteComponent<MetaTagProps>;

/** Reads the current route state and navigation function. */
export declare function useRoute<
  Params extends RouteParams = RouteParams,
  Query extends RouteQuery = RouteQuery
>(): UseRouteResult<Params, Query>;

/** Reads the current route parameters. */
export declare function useParams<Params extends RouteParams = RouteParams>(): State<Params>;

/** Reads the current route query parameters. */
export declare function useQuery<Query extends RouteQuery = RouteQuery>(): State<Query>;

/** Gets the current navigation function. */
export declare function useNavigate(): Navigate;

/** Reads global and path-specific navigation loading state. */
export declare function useRouteStatus(): UseRouteStatusResult;

/**
 * Reads data from the active route's preload hook. The callback argument is
 * only a type hint; the active route's registered preload still supplies data.
 */
export declare function useRouteData<Preload extends (...args: any[]) => any>(
  preload: Preload
): UseRouteDataResult<Awaited<ReturnType<Preload>>>;

/** Reads route data when no preload type hint is provided. */
export declare function useRouteData<Data = unknown>(): UseRouteDataResult<Data>;

/** Matches a pathname against a route pattern such as `/users/:id`. */
export declare function matchRoute(
  pattern: string,
  path: string | URL
): [matched: boolean, params: RouteParams];
