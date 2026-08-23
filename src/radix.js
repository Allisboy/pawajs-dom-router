// radix.js
const isDynamic = (seg) => seg.startsWith(':') || seg.startsWith('*') || seg.startsWith(':...')

class RadixNode {
  constructor() {
    this.staticChildren = new Map()   // literal segment → node
    this.dynamicChild = null          // :param
    this.catchallChild = null         // *param or :...param
    this.paramName = null
    this.route = null                 // the registered route object (leaf only)
  }
}

export class RadixRouter {
  constructor() {
    this.root = new RadixNode()
  }

  /**
   * Insert a route
   * @param {string} path  e.g. "/user/:id/posts/*slug"
   * @param {object} routeData  whatever you currently store in routesArray
   */
  insert(path, routeData) {
    const segments = path.split('/').filter(Boolean)
    let node = this.root

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]

      // Catch-all (must be last)
      if (seg.startsWith('*') || seg.startsWith(':...')) {
        const paramName = seg.startsWith('*') ? seg.slice(1) : seg.slice(4)
        if (!node.catchallChild) {
          node.catchallChild = new RadixNode()
          node.catchallChild.paramName = paramName
        }
        node = node.catchallChild
        break // catch-all consumes the rest
      }

      // Dynamic :param
      if (seg.startsWith(':')) {
        const paramName = seg.slice(1)
        if (!node.dynamicChild) {
          node.dynamicChild = new RadixNode()
          node.dynamicChild.paramName = paramName
        }
        node = node.dynamicChild
        continue
      }

      // Static segment
      if (!node.staticChildren.has(seg)) {
        node.staticChildren.set(seg, new RadixNode())
      }
      node = node.staticChildren.get(seg)
    }

    node.route = routeData
  }

  /**
   * Match a pathname or URL and parse its query string.
   * @returns {[boolean, object, object|null, object]} [matched, params, routeData, query]
   */
  match(pathname) {
    const url = new URL(pathname, 'http://router.local')
    const query = {}

    for (const [key, value] of url.searchParams) {
      if (query[key] === undefined) {
        query[key] = value
      } else if (Array.isArray(query[key])) {
        query[key].push(value)
      } else {
        query[key] = [query[key], value]
      }
    }

    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const params = {}

    const result = this.#matchNode(this.root, segments, 0, params)
    if (result) {
      return [true, params, result, query]
    }
    return [false, {}, null, query]
  }

  #matchNode(node, segments, index, params) {
    // End of path
    if (index === segments.length) {
      return node.route || null
    }

    const seg = segments[index]

    // 1. Try static match first (highest priority)
    if (node.staticChildren.has(seg)) {
      const found = this.#matchNode(node.staticChildren.get(seg), segments, index + 1, params)
      if (found) return found
    }

    // 2. Try dynamic :param
    if (node.dynamicChild) {
      const paramName = node.dynamicChild.paramName
      const previous = params[paramName]
      params[paramName] = seg

      const found = this.#matchNode(node.dynamicChild, segments, index + 1, params)
      if (found) return found

      // backtrack
      if (previous === undefined) delete params[paramName]
      else params[paramName] = previous
    }

    // 3. Try catch-all
    if (node.catchallChild) {
      const paramName = node.catchallChild.paramName
      params[paramName] = segments.slice(index).join('/')
      return node.catchallChild.route || null
    }

    return null
  }
}