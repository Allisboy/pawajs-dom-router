# Pawajs Router

A file-based client-side router for [Pawajs](https://pawajs.vercel.app/) applications.

## Installation

```bash
npm install pawajs pawajs-router
npm install -D vite pawajs-vite-plugin
```

## Setup

Register the router plugin in `vite.config.js`:

```js
import { defineConfig } from "vite"
import { pawajsPlugin } from "pawajs-vite-plugin"
import { pawaFileRoutes } from "pawajs-router/routePlugin"

export default defineConfig({
  plugins: [
    pawajsPlugin(),
    pawaFileRoutes()
  ]
})
```

Use the generated routes with the router:

```js
import { RegisterComponent, html, pawaStartApp } from "pawajs"
import { Router, RoutePlugin, setRoute } from "pawajs-router"
import { allRoutes } from "./routes/generated-routes.js"

RoutePlugin()
setRoute(allRoutes)
RegisterComponent(Router)

const App = () => html`<router></router>`
RegisterComponent(App)
pawaStartApp(document.querySelector("app"))
```

The plugin generates `src/routes/generated-routes.js` by default.

## Route Files

Routes are created from `page.js` files:

```text
src/routes/
  layout.js
  page.js
  404.js
  about/
    page.js
  users/
    [id]/
      page.js
```

This produces `/`, `/about`, and `/users/:id`. Dynamic folder names use `[param]`; catch-all folders use `[...path]`. A `layout.js` wraps the routes below its directory. Use `404.js` or `not-found.js` for a not-found page.

A page module exports one component. Named exports ending in `Page` are recommended:

```js
import { html } from "pawajs"

export const AboutPage = () => html`
  <h1>About</h1>
`
```

A default component export is also supported.

## Plugin Options

```js
pawaFileRoutes({
  routesDir: "src/routes",
  output: "src/routes/generated-routes.js",
  extensions: [".js", ".ts"]
})
```

## Loaders

Export a `loader` from a page or layout module. It runs before the route renders.

```js
import { html } from "pawajs"

export const loader = async ({ params, query, path, signal }) => {
  const response = await fetch(`/api/users/${params.id}`, { signal })
  if (!response.ok) throw new Error("Could not load user")
  return response.json()
}

export const UserPage = ({ children }) => html`
  <article>${children}</article>
`
```

Loader results are cached by route path and dynamic route name. The loader receives parsed route parameters, query values, the current path, and an `AbortSignal`.

## Route Data

Use `useRouteData` inside a page or layout:

```js
import { html } from "pawajs"
import { useRouteData } from "pawajs-router"

export const UserPage = () => {
  const { data, reload } = useRouteData()

  return html`
    <div if="data">
      <h1>@{data.name}</h1>
      <button on-click="reload()">Reload</button>
    </div>
  `
}
```

## Guards

A `guard` can allow navigation, deny it with `false`, or redirect by returning a URL.

```js
export const guard = async ({ data, allData, params, navigate }) => {
  if (!data?.user) return "/login"
  return true
}
```

Guard errors and denied navigation are handled by the router. A denied route renders the access-denied fallback; a redirect starts a new navigation.

## Navigation

`useRoute` exposes the current location. Its returned state is a Pawajs `State` and is read through `.value`.

```js
import { html } from "pawajs"
import { useRoute } from "pawajs-router"

export const Navigation = () => {
  const { current } = useRoute()

  return html`
    <p>@{current.value.path}</p>
    <button on-click="current.value.push('/about')">About</button>
  `
}
```

`useRouter` exposes the current route parameters and query values for the active route.

## Parallel Routes

Render an independent route slot with `parallel-route`:

```js
import { html, RegisterComponent } from "pawajs"
import { ParallelRoute } from "pawajs-router"

RegisterComponent(ParallelRoute)

export const DashboardPage = () => html`
  <main>
    <parallel-route :route="'/favorite'"></parallel-route>
  </main>
`
```

The `route` prop is a Pawajs getter. Most component props in the router use getters; `children` is the direct slot value.

## Intercepted Routes

Register `RouteIntercepter` and `InterceptSlot` when a route should render inside an active route:

```js
import { html, RegisterComponent } from "pawajs"
import { InterceptSlot, RouteIntercepter } from "pawajs-router"

RegisterComponent(RouteIntercepter, InterceptSlot)

export const Layout = ({ children }) => html`
  <route-intercepter :route="'/favorite'">
    <div class="modal">
      <intercept-slot></intercept-slot>
    </div>
  </route-intercepter>
  ${children}
`
```

## Cache Control

Invalidate loader data after a mutation:

```js
import { cache } from "pawajs-router"

cache.invalidate("/users/42", "users")
cache.invalidateName("users")
cache.clear()
```

The package also exports `invalidateLoader`, `invalidateByName`, and `clearLoaderCache` directly.

## TypeScript

The package includes declarations in `index.d.ts` and `routePlugin.d.ts`:

```ts
import type {
  RouteDefinition,
  RouteLoader,
  RouteGuard
} from "pawajs-router"
import type { PawaFileRoutesOptions } from "pawajs-router/routePlugin"
```

Pawajs component props are getter-based. For example:

```ts
interface UserProps {
  id: () => string
  children?: string
}
```
