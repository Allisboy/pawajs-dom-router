const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const getRequestHead = (req) => {
  req.pawaHead ??= { title: undefined, meta: [] };
  return req.pawaHead;
};

export const setServerTitle = (req, title) => {
  if (req) getRequestHead(req).title = String(title ?? "");
};

export const setServerMeta = (req, attributes) => {
  if (!req) return;

  const meta = getRequestHead(req).meta;
  const normalized = Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
  const keyAttribute = ["name", "property", "http-equiv", "charset"]
    .find((attribute) => normalized[attribute] !== undefined);
  if (!keyAttribute) return;

  const key = `${keyAttribute}:${normalized[keyAttribute]}`;
  const index = meta.findIndex((item) => item.key === key);
  const item = { key, attributes: normalized };
  if (index === -1) meta.push(item);
  else meta[index] = item;
};

export const renderHeadMarkup = (head) => {
  if (!head) return "";

  const title = head.title === undefined ? "" : `<title>${escapeHtml(head.title)}</title>`;
  const meta = (head.meta ?? []).map(({ attributes }) => {
    const serialized = Object.entries(attributes)
      .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
      .join(" ");
    return `<meta ${serialized}>`;
  }).join("");

  return `${title}${meta}`;
};

export const injectHeadMarkup = (documentStart, head) => {
  const markup = renderHeadMarkup(head);
  if (!markup) return documentStart;

  if (/<\/head\s*>/i.test(documentStart)) {
    return documentStart.replace(/<\/head\s*>/i, `${markup}</head>`);
  }
  return `${markup}${documentStart}`;
};