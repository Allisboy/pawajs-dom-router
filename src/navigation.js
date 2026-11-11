const positions = new Map();
let pending = null;
let lastPath = "";
let started = false;

const pathOf = (loc = location) => loc.pathname + loc.search;
const keyOf = () => history.state?.__pawaKey ?? "initial";
const newState = () => ({ __pawaKey: crypto.randomUUID?.() ?? String(Date.now() + Math.random()) });

const saveScroll = () => positions.set(keyOf(), { x: scrollX, y: scrollY });

const scrollToHash = (hash) => {
  if (hash && hash !== "#") {
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch {}
    const target = document.getElementById(id) ?? document.getElementsByName(id)[0];
    if (target) return target.scrollIntoView();
  }
  window.scrollTo(0, 0);
};

const applyPending = () => {
  const task = pending;
  pending = null;
  if (!task) return;
  requestAnimationFrame(() => {
    if (task.restore) window.scrollTo(task.restore.x, task.restore.y);
    else scrollToHash(task.hash);
  });
};

export const startNavigation = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  lastPath = pathOf();
  history.scrollRestoration = "manual";
  if (!history.state?.__pawaKey) history.replaceState({ ...history.state, ...newState() }, "");

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { saveScroll(); ticking = false; });
  }, { passive: true });

  // The Router dispatches this after syncRouteState finishes rendering
  window.addEventListener("pawa:routed", () => {
    lastPath = pathOf();
    applyPending();
  });

  window.addEventListener("popstate", () => {
    const restore = positions.get(keyOf()) ?? { x: 0, y: 0 };
    if (pathOf() === lastPath) {
      // Hash-only or same-route back/forward: nothing will re-render
      pending = { restore };
      applyPending();
    } else {
      pending = { restore };
    }
  });
};

export const navigateTo = (to, { replace = false, scroll = true } = {}) => {
  const url = new URL(String(to), location.href);
  const next = url.pathname + url.search + url.hash;
  const current = location.pathname + location.search + location.hash;
  const samePath = pathOf(url) === pathOf();

  if (next === current) {
    if (scroll) scrollToHash(url.hash);   // clicking the link you're already on
    return;
  }

  saveScroll();
  history[replace ? "replaceState" : "pushState"](newState(), "", next);

  if (!scroll) return;
  if (samePath) scrollToHash(url.hash);   // no route render coming, scroll now
  else pending = { hash: url.hash };
};