// Cloudflare host objects stay opaque to Gleam. No Node-specific dependencies.
export const new_rewriter = () => new HTMLRewriter();
export const on_element = (rewriter, selector, handler) => rewriter.on(selector, {element: handler});
export const remove = element => { element.remove(); };
export const append_html = (element, html) => { element.append(html, {html: true}); };
export const transform = (rewriter, response) => rewriter.transform(response);
