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
		if (url.pathname === '/login') {
			redirectToApi = true;
		}

		if (url.pathname === '/profile') {
			redirectToApi = true;
		}

		if (url.pathname.startsWith('/oauth/callback')) {
			redirectToApi = true;
		}

		if (url.pathname === '/client-metadata.json') {
			redirectToApi = true;
		}

		if (url.pathname === '/token') {
			redirectToApi = true;
		}

		if (redirectToApi) {
			const proxyUrl = new URL(request.url);
			proxyUrl.host = 'api.rocksky.app';
			proxyUrl.hostname = 'api.rocksky.app';
			return fetch(proxyUrl, request) as any;
		}

		const proxyUrl = new URL(request.url);
		proxyUrl.host = 'rocksky.pages.dev';
		proxyUrl.hostname = 'rocksky.pages.dev';
		return fetch(proxyUrl, request) as any;
	},
} satisfies ExportedHandler<Env>;
