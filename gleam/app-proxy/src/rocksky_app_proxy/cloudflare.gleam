/// Typed bindings to Cloudflare Workers' streaming HTMLRewriter API.
/// These require the Workers runtime (or a compatible test implementation).
import rocksky_app_proxy/web.{type Response}

pub type HtmlRewriter

pub type Element

@external(javascript, "./cloudflare_ffi.mjs", "new_rewriter")
pub fn new_rewriter() -> HtmlRewriter

@external(javascript, "./cloudflare_ffi.mjs", "on_element")
pub fn on_element(
  rewriter: HtmlRewriter,
  selector: String,
  handler: fn(Element) -> Nil,
) -> HtmlRewriter

@external(javascript, "./cloudflare_ffi.mjs", "remove")
pub fn remove(element: Element) -> Nil

@external(javascript, "./cloudflare_ffi.mjs", "append_html")
pub fn append_html(element: Element, html: String) -> Nil

@external(javascript, "./cloudflare_ffi.mjs", "transform")
pub fn transform(rewriter: HtmlRewriter, response: Response) -> Response
