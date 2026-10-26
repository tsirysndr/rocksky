import { response } from '../../build/dev/javascript/rocksky_app_proxy/rocksky_app_proxy/app_links.mjs';
import { proxy as homepage } from '../../build/dev/javascript/rocksky_app_proxy/rocksky_app_proxy/homepage.mjs';
import { proxy as asset } from '../../build/dev/javascript/rocksky_app_proxy/rocksky_app_proxy/landing_assets.mjs';
import { homepage as isHomepage } from '../../build/dev/javascript/rocksky_app_proxy/rocksky_app_proxy/routing.mjs';
export { default } from '../worker.mjs';
export const appLinkResponse = (path, env) => ['/.well-known/assetlinks.json', '/.well-known/apple-app-site-association'].includes(path) ? response(path, env) : undefined;
export const proxyHomepage = async request => isHomepage(request) ? homepage(request) : null;
export const proxyLandingAsset = async request => new URL(request.url).pathname.startsWith('/_landing/') ? asset(request) : null;
