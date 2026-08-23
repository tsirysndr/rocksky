// Disable the OS text-meddling features on every text input in the app.
//
// WKWebView (and Windows webview2) apply autocorrect/autocapitalize/spell-
// checking to plain <input>/<textarea>/contenteditable elements, which is
// wrong for handles, search queries, API keys, and shout composition. Rather
// than touching every ported component, stamp the attributes on all current
// and future editable elements via a MutationObserver.

const ATTRS: Record<string, string> = {
  autocomplete: "off",
  autocorrect: "off",
  autocapitalize: "off",
  spellcheck: "false",
};

const SELECTOR = "input, textarea, [contenteditable]";

function stamp(el: Element): void {
  // Don't fight a component that set an explicit autocomplete value
  // (e.g. autocomplete="current-password" for password managers).
  for (const [name, value] of Object.entries(ATTRS)) {
    if (name === "autocomplete" && el.hasAttribute(name)) continue;
    el.setAttribute(name, value);
  }
}

function sweep(root: ParentNode): void {
  if (root instanceof Element && root.matches(SELECTOR)) stamp(root);
  root.querySelectorAll(SELECTOR).forEach(stamp);
}

export function disableTextMeddling(): void {
  sweep(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) sweep(node);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
