const historySubscriptions = new WeakMap();

export const subscribeHistory = (target, listener) => {
  let subscription = historySubscriptions.get(target);

  if (!subscription) {
    const history = target.history;
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    const dispatch = () => target.dispatchEvent(new target.Event("pushchange"));
    const patchedPush = function (...args) {
      const result = originalPush.apply(this, args);
      dispatch();
      return result;
    };
    const patchedReplace = function (...args) {
      const result = originalReplace.apply(this, args);
      dispatch();
      return result;
    };

    history.pushState = patchedPush;
    history.replaceState = patchedReplace;
    target.addEventListener("popstate", dispatch);
    subscription = {
      count: 0,
      history,
      originalPush,
      originalReplace,
      patchedPush,
      patchedReplace,
      dispatch,
    };
    historySubscriptions.set(target, subscription);
  }

  subscription.count++;
  target.addEventListener("pushchange", listener);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    target.removeEventListener("pushchange", listener);

    subscription.count--;
    if (subscription.count > 0) return;

    const {
      history,
      originalPush,
      originalReplace,
      patchedPush,
      patchedReplace,
      dispatch,
    } = subscription;
    if (history.pushState === patchedPush) history.pushState = originalPush;
    if (history.replaceState === patchedReplace) history.replaceState = originalReplace;
    target.removeEventListener("popstate", dispatch);
    historySubscriptions.delete(target);
  };
};