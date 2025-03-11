/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.json`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		let redirectToApi = false;

		const API_ROUTES = ['/login', '/profile', '/client-metadata.json', '/token', '/now-playing'];

		if (
			API_ROUTES.includes(url.pathname) ||
			url.pathname.startsWith('/oauth/callback') ||
			url.pathname.startsWith('/users') ||
			url.pathname.startsWith('/albums') ||
			url.pathname.startsWith('/artists') ||
			url.pathname.startsWith('/tracks') ||
			url.pathname.startsWith('/scrobbles') ||
			url.pathname.startsWith('/likes') ||
			url.pathname.startsWith('/spotify') ||
			url.pathname.startsWith('/dropbox') ||
			url.pathname.startsWith('/googledrive') ||
			url.pathname.startsWith('/search') ||
			url.pathname.startsWith('/public/scrobbles')
		) {
			redirectToApi = true;
		}

		if (redirectToApi) {
			const proxyUrl = new URL(request.url);
			proxyUrl.host = 'api.rocksky.app';
			proxyUrl.hostname = 'api.rocksky.app';
			return fetch(proxyUrl, request) as any;
		}

		// check header if from mobile device, android or ios
		const userAgent = request.headers.get('user-agent');
		const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
		const isMobile = mobileRegex.test(userAgent!);

		if (isMobile) {
			const mobileUrl = new URL(request.url);
			mobileUrl.host = 'm.rocksky.app';
			mobileUrl.hostname = 'm.rocksky.app';
			return fetch(mobileUrl, request);
		}

		const proxyUrl = new URL(request.url);
		proxyUrl.host = 'rocksky.pages.dev';
		proxyUrl.hostname = 'rocksky.pages.dev';
		return fetch(proxyUrl, request) as any;
	},
} satisfies ExportedHandler<Env>;
