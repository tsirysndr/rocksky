import { fromAff } from '../../output/Control.Promise/index.js';
import { appLinkResponse as association } from '../../output/Rocksky.AppProxy.AppLinks/index.js';
import { proxyHomepage as homepage } from '../../output/Rocksky.AppProxy.Homepage/index.js';
import { proxyLandingAsset as asset } from '../../output/Rocksky.AppProxy.LandingAssets/index.js';
export { default } from '../worker.js';
const unwrap = maybe => maybe.value0 ?? null;
export const appLinkResponse = (path, env) => unwrap(association(path)(env)()) ?? undefined;
export const proxyHomepage = async request => unwrap(await fromAff(homepage(request))());
export const proxyLandingAsset = async request => unwrap(await fromAff(asset(request))());
