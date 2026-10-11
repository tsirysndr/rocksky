import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./tauri";

/** Open web links in the system browser without navigating the native player. */
export function installExternalLinks(): void {
  if (!isTauri()) return;
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const anchor =
      event.target.closest<HTMLAnchorElement>('a[target="_blank"]');
    if (!anchor || !/^https?:$/.test(new URL(anchor.href).protocol)) return;
    event.preventDefault();
    void openUrl(anchor.href).catch((error) => {
      console.error("Could not open external link", error);
    });
  });
}
