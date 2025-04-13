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

const metadata = {
	redirect_uris: ["https://rocksky.app/oauth/callback"],
	response_types: ["code"],
	grant_types: ["authorization_code", "refresh_token"],
	scope: "atproto transition:generic",
	token_endpoint_auth_method: "none",
	application_type: "web",
	client_id: "https://rocksky.app/client-metadata.json",
	client_name: "AT Protocol Express App",
	client_uri: "https://rocksky.app",
	dpop_bound_access_tokens: true,
};

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		let redirectToApi = false;

		const API_ROUTES = ["/login", "/profile", "/token", "/now-playing", "/ws"];

		console.log(
			"Request URL:",
			url.pathname,
			url.pathname === "/client-metadata.json",
		);

		if (url.pathname === "/client-metadata.json") {
			return Response.json(metadata);
		}

		if (
			API_ROUTES.includes(url.pathname) ||
			url.pathname.startsWith("/oauth/callback") ||
			url.pathname.startsWith("/users") ||
			url.pathname.startsWith("/albums") ||
			url.pathname.startsWith("/artists") ||
			url.pathname.startsWith("/tracks") ||
			url.pathname.startsWith("/scrobbles") ||
			url.pathname.startsWith("/likes") ||
			url.pathname.startsWith("/spotify") ||
			url.pathname.startsWith("/apikeys") ||
			url.pathname.startsWith("/dropbox/oauth/callback") ||
			url.pathname.startsWith("/googledrive/oauth/callback") ||
			url.pathname.startsWith("/dropbox/files") ||
			url.pathname.startsWith("/dropbox/file") ||
			url.pathname.startsWith("/googledrive/files") ||
			url.pathname.startsWith("/dropbox/login") ||
			url.pathname.startsWith("/googledrive/login") ||
			url.pathname.startsWith("/dropbox/join") ||
			url.pathname.startsWith("/googledrive/join") ||
			url.pathname.startsWith("/search") ||
			url.pathname.startsWith("/public/scrobbles")
		) {
			redirectToApi = true;
		}

		if (redirectToApi) {
			const proxyUrl = new URL(request.url);
			proxyUrl.host = "api.rocksky.app";
			proxyUrl.hostname = "api.rocksky.app";
			return fetch(proxyUrl, request) as any;
		}

		// check header if from mobile device, android or ios
		const userAgent = request.headers.get("user-agent");
		const mobileRegex =
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
		const isMobile = mobileRegex.test(userAgent!);

		if (isMobile) {
			const mobileUrl = new URL(request.url);
			mobileUrl.host = "m.rocksky.app";
			mobileUrl.hostname = "m.rocksky.app";
			return fetch(mobileUrl, request);
		}

		const proxyUrl = new URL(request.url);
		proxyUrl.host = "rocksky.pages.dev";
		proxyUrl.hostname = "rocksky.pages.dev";
		return fetch(proxyUrl, request) as any;
	},
} satisfies ExportedHandler<Env>;
