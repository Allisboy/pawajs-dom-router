import type { State } from "pawajs"

export type MaybeGetter<T> = T | (() => T)
export type PropGetter<T> = () => T

export type ReactiveState<T> = State<T>

export type RouteComponent<Props = Record<string, unknown>> =
  (props?: Props) => unknown | Promise<unknown>

export interface RouteLoaderContext<Params = Record<string, string>, Query = RouteQuery> {
  name?: string
  path: string
  params: Params
  query: Query
  signal?: AbortSignal
}

export type RouteLoader<
  Data = unknown,
  Params = Record<string, string>,
  Query = RouteQuery
> = (context: RouteLoaderContext<Params, Query>) => Data | Promise<Data>

export interface RouteGuardContext<
  Data = unknown,
  AllData = Record<string, unknown>,
  Params = Record<string, string>,
  Query = RouteQuery
> {
  params: Params
  query: Query
  path: string
  data: Data | undefined
  allData: AllData
  navigate: (url: string) => void
}

export type RouteGuardResult = boolean | string | void | Promise<boolean | string | void>

export type RouteGuard<
  Data = unknown,
  AllData = Record<string, unknown>,
  Params = Record<string, string>,
  Query = RouteQuery
> = (context: RouteGuardContext<Data, AllData, Params, Query>) => RouteGuardResult

export interface RouteModule<
  PageProps = Record<string, unknown>,
  Data = unknown,
  Params = Record<string, string>,
  Query = RouteQuery
> {
  default?: RouteComponent<PageProps>
  loader?: RouteLoader<Data, Params, Query>
  guard?: RouteGuard<Data, Record<string, unknown>, Params, Query>
  [exportName: string]: unknown
}

export type RoutePageLoader<
  PageProps = Record<string, unknown>,
  Data = unknown,
  Params = Record<string, string>,
  Query = RouteQuery
> = () => Promise<RouteModule<PageProps, Data, Params, Query>>

export type RouteQuery = Record<string, string | string[]>

export interface RouteDefinition {
  name: string
  page: RoutePageLoader
  route?: string
  notfound?: boolean
  layout?: boolean
  guard?: RouteGuard
  children?: RouteDefinition[]
}

export interface RouteState {
  loading: boolean
  failed: boolean
  msg: string
}

export interface RouteLocation {
  path: string
  fullPath: string
  param: Record<string, string>
  query: RouteQuery
  push(url: string): void
  replace(url: string): void
  back(): void
}

export interface UseRouteResult {
  current: ReactiveState<RouteLocation>
}

export interface UseRouterLocation {
  param: Record<string, string> | null
  query: RouteQuery
  route: string
}

export interface UseRouterResult {
  current: ReactiveState<UseRouterLocation>
}

export interface RouteReaderProps {
  tree: PropGetter<RouteTree>
  index: PropGetter<number>
}

export type RouteTree = Array<{
  name: string
  page: RoutePageLoader
  type?: "layout" | "route"
  path?: string
}>

export interface ParallelRouteProps {
  route: PropGetter<string>
}

export interface RouteIntercepterProps {
  route: PropGetter<string>
  children?: unknown
}

export interface UseRouteDataResult<Data = unknown> {
  data: Data | undefined
  name?: string
  reload(options?: {
    params?: Record<string, string>
    query?: RouteQuery
    signal?: AbortSignal
  }): Promise<Data | null>
}

export interface CacheApi {
  invalidate(path: string, name?: string | null): void
  invalidateName(name: string): void
  clear(): void
}

export declare const isRoute: ReactiveState<RouteState>
export declare const routeContext: unknown
export declare const routeReaderContext: unknown

export declare function setRoute(routes: RouteDefinition[]): void

export declare const Router: RouteComponent
export declare const RouteReader: RouteComponent<RouteReaderProps>
export declare const ParallelRoute: RouteComponent<ParallelRouteProps>
export declare const RouteIntercepter: RouteComponent<RouteIntercepterProps>
export declare const InterceptSlot: RouteComponent
export declare const RoutePlugin: () => void

export declare function useRoute(): UseRouteResult
export declare function useRouter(): UseRouterResult
export declare function useRouteData<Data = unknown>(): UseRouteDataResult<Data>
export declare function invalidateLoader(path: string, name?: string | null): void
export declare function invalidateByName(name: string): void
export declare function clearLoaderCache(): void
export declare const cache: CacheApi
