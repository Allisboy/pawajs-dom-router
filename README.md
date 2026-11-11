# @pawajs/router

A router for Pawajs applications that supports client-side navigation and
server-side rendering. Routes and layouts are declared with Pawajs components;
the router also provides reactive location state, route guards, preload hooks,
and document metadata helpers.

## Installation

```bash
npm install pawajs @pawajs/router
```

For file-based routes, install Vite as a development dependency:

```bash
npm install -D vite
```

Add the router plugin to the Vite config. It generates the `~pages` virtual
module, which the app entry passes to `FileRouter`:

```js
import { defineConfig } from "vite"
import { pawaFileRouter } from "@pawajs/router/vite"

export default defineConfig({
  plugins: [pawaFileRouter()],
})
```

```js
import pages from "~pages"
import { FileRouter } from "@pawajs/router/filesystem"

const App = () => html`
  <router>
    <file-router :routes="pages"></file-router>
  </router>
`
```

The default route directory is `src/pages`. Configure another directory with
`pawaFileRouter({ pagesDir: "app/routes" })`. Vite is an optional peer
dependency; apps that only use manually declared routes do not need it.

## Setup

Register `Router`, `Route`, and each page component with Pawajs. A route's
`name` must match the registered component name that should render for it.

```js
import { html, pawaStartApp, RegisterComponent } from "pawajs"
import { Router, Route } from "@pawajs/router"

const Home = () => html`<h1>Home</h1>`
const About = () => html`<h1>About</h1>`

const App = () => html`
  <router>
    <route path="/" name="home"></route>
    <route path="/about" name="about"></route>
  </router>
`

RegisterComponent(Router, Route, Home, About, App)
pawaStartApp(document.querySelector("app"))
```

The `url` prop on `<router>` can supply an initial URL getter. Otherwise, the
router starts from the current browser URL, or `/` during server rendering.

## Server-side rendering

Use the router with `pawaServer` as part of the server render. Pass the request
and response in the render context so route guards and metadata helpers can
access them. The router records redirects on `req.pawaRedirect`; handle that
after rendering and before sending the HTML. `injectHeadMarkup` adds metadata
collected by `RouteTitle` and `MetaTag` to the document head.

```js
import { pawaServer } from "@pawajs/ssr"
import { RegisterComponent } from "pawajs"
import { injectHeadMarkup } from "@pawajs/router"
import { App } from "./app.js"

RegisterComponent(App)

export const main = async (
  { url, write, templateStart, templateEnd },
  res,
  req,
) => {
  let stream = ""
  const setStream = (chunk) => {
    if (write) {
      if (res.headersSent) return
      write(chunk)
      res.flush?.()
    } else {
      stream += chunk
    }
  }

  const template = "<div><app></app></div>"
  try {
    const isDevelopment = process.env.NODE_ENV !== "production"
    const { render, batches } = pawaServer(
      template,
      { url, req, res },
      true,
      isDevelopment,
      false,
    )
    const { hydrate, string } = await render()

    if (req?.pawaRedirect && !res.headersSent) {
      res.status(302).set("Location", req.pawaRedirect)
      return
    }

    setStream(injectHeadMarkup(templateStart, req?.pawaHead))
    setStream(string)

    const [beforeScripts, afterScripts] = templateEnd.split("<!--script-->")
    setStream(`<script type="application/json" id="hydrate">${JSON.stringify(hydrate)}</script>`)
    setStream(beforeScripts)
    await batches(setStream)
    setStream(afterScripts)
    if (!write) return stream
  } catch (error) {
    console.error("SSR render failed", error)
    throw error
  }
}
```

## Routes and layouts

Use `:param` for a dynamic path segment and `*name` or `:...name` for a
catch-all segment. `useRoute()` exposes the matched params and the current
route:

```js
import { html, RegisterComponent } from "pawajs"
import { useRoute } from "@pawajs/router"

const User = () => {
  const { params } = useRoute()
  return html`<h1>User @{params.value.id}</h1>`
}

RegisterComponent(User)
```

Routes can be nested under a route marked as a layout. The layout component
should render a `<slot>` where its child route content belongs:

```js
const UserLayout = () => html`
  <main>
    <header>User area</header>
    <slot></slot>
  </main>
`

const App = () => html`
  <router>
    <route path="/users" name="user-layout" :layout="true">
      <route path="/:id" name="user"></route>
    </route>
  </router>
`

RegisterComponent(UserLayout)
```

The nested route inherits its parent's path, so the example resolves
`/users/:id`. Route and layout components must be registered with Pawajs under
the names used by their corresponding `name` props.

For manual routes, declare a root-level `/404` route to provide the global
not-found page. Its `name` must match the registered not-found component:

```js
const GlobalNotFound = () => html`<h1>Page not found</h1>`

const App = () => html`
  <router>
    <route path="/" name="home"></route>
    <route path="/404" name="globalNotFound"></route>
  </router>
`

RegisterComponent(GlobalNotFound)
```

The router uses the `/404` path as the fallback for unmatched URLs; the route
name is used to find the component to render.

## Navigation

`useRoute()` returns reactive `route`, `params`, `query`, `names`, and `ids`
states, a `current` matching route record, and a `navigate` function.
Convenience hooks `useParams()`, `useQuery()`, and `useNavigate()` return the
corresponding values directly.

```js
import { html } from "pawajs"
import { useNavigate, useRoute } from "@pawajs/router"

const Navigation = () => {
  const { route } = useRoute()
  const navigate = useNavigate()
  useInsert({route,navigate})
  return html`
    <p>Current URL: @{route.value}</p>
    <button on-click="navigate('/about')">About</button>
  `
}
```

Navigation accepts optional `replace` and `scroll` settings:

```js
navigate("/users/42", { replace: true, scroll: false })
```

The router also registers the `routeLink` attribute plugin for same-origin
links. It preserves normal browser behavior for modified clicks, downloads,
external targets, and external links.

## Preloading route data

Pass a preload callback to a route. It receives the current URL, params, query,
and active route names. `useRouteData()` exposes the result as reactive state
and provides `reload()` and `clearCache()`:

```js
import { html } from "pawajs"
import { useRouteData } from "@pawajs/router"

const loadUser = async ({ param, query, route }) => {
  const response = await fetch(`/api/users/${param.id}?${new URLSearchParams(query)}`)
  if (!response.ok) throw new Error(`Could not load user for ${route}`)
  return response.json()
}

const User = () => {
  const { data, reload } = useRouteData(loadUser)
  return html`
    <article if="data.value">
      <h1>@{data.value.name}</h1>
      <button on-click="reload()">Reload</button>
    </article>
  `
}

const App = () => html`
  <router>
    <route path="/users/:id" name="user" :preload="loadUser"></route>
  </router>
`
```

The `preload` prop may also be `true` for a lazy route whose loaded module
exports a `preload` function. `reload()` bypasses the cached result. Use
`clearCache(key)` to remove one cache entry, or `clearCache()` to clear all
entries for the active route.

## Guards

A route guard can allow navigation, deny it by returning `false`, or redirect
by returning a URL string. Guard callbacks receive the same context as preload
callbacks:

```js
const requireLogin = ({ param, route }) => {
  if (!isLoggedIn()) return "/login"
  return true
}

const App = () => html`
  <router>
    <route
      path="/account/:section"
      name="account"
      :guard="requireLogin"
    ></route>
  </router>
`
```

## Document metadata

Register `RouteTitle` and `MetaTag` to update the document title and meta tags.
On the server, these helpers add metadata to the request head when the request
object is available in the Pawajs component context.

```js
import { html, RegisterComponent } from "pawajs"
import { RouteTitle, MetaTag } from "@pawajs/router"

const Page = () => html`
  <div>
    <route-title value="Account"></route-title>
    <meta-tag name="description" content="Manage your account"></meta-tag>
    <h1>Account</h1>
  </div>
`

RegisterComponent(RouteTitle, MetaTag, Page)
```

## TypeScript

The package exports declarations for the router components, route hook
contexts, navigation options, route guards and preload callbacks:

```ts
import type {
  RouteGuard,
  RouteHookContext,
  RoutePreload,
  RouteDataOf,
  UseRouteResult,
} from "@pawajs/router"
```

The router cannot infer the preload type across separate route and page
components. Pass the preload function's type to `useRouteData` to get its
resolved return type:

```ts
const loadUser = async ({ param }: RouteHookContext) => {
  const response = await fetch(`/api/users/${param.id}`)
  return response.json() as Promise<{ id: string; name: string }>
}

type UserData = RouteDataOf<typeof loadUser>
const { data } = useRouteData(loadUser)
// data.value is UserData | undefined
```

The argument is only used for type inference; the hook still reads and reloads
the preload registered for the active route. JavaScript users can pass the
preload function directly to get editor type hints when using TypeScript-aware
JavaScript tooling.

## License

This project is open source and available under the [MIT License](LICENSE).
