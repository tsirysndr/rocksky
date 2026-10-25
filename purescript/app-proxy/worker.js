import { fetch } from '../output/Rocksky.AppProxy.Index/index.js';

export default {
  fetch(request, env) {
    return fetch(request)(env)();
  },
};
