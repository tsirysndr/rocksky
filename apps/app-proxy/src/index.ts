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
	redirect_uris: ['https://rocksky.app/oauth/callback'],
	response_types: ['code'],
	grant_types: ['authorization_code', 'refresh_token'],
	scope:
		'atproto repo:app.rocksky.album repo:app.rocksky.artist repo:app.rocksky.graph.follow repo:app.rocksky.like repo:app.rocksky.playlist repo:app.rocksky.scrobble repo:app.rocksky.shout repo:app.rocksky.song repo:app.rocksky.feed.generator repo:fm.teal.alpha.feed.play repo:fm.teal.alpha.actor.status',
	token_endpoint_auth_method: 'private_key_jwt',
	token_endpoint_auth_signing_alg: 'ES256',
	jwks_uri: 'https://rocksky.app/jwks.json',
	application_type: 'web',
	client_id: 'https://rocksky.app/oauth-client-metadata.json',
	client_name: 'Rocksky',
	client_uri: 'https://rocksky.app',
	dpop_bound_access_tokens: true,
};

const jwks = {
	keys: [
		{
			kty: 'EC',
			use: 'sig',
			alg: 'ES256',
			kid: '2dfa3fd9-57b3-4738-ac27-9e6dadec13b7',
			crv: 'P-256',
			x: 'V_00KDnoEPsNqbt0y2Ke8v27Mv9WP70JylDUD5rvIek',
			y: 'HAyjaQeA2DU6wjZO0ggTadUS6ij1rmiYTxzmWeBKfRc',
		},
		{
			kty: 'EC',
			use: 'sig',
			alg: 'ES256',
			kid: '5e816ff2-6bff-4177-b1c0-67ad3cd3e7cd',
			crv: 'P-256',
			x: 'YwEY5NsoYQVB_G7xPYMl9sUtxRbcPFNffnZcTS5nbPQ',
			y: '5n5mybPvISyYAnRv1Ii1geqKfXv2GA8p9Xemwx2a8CM',
		},
		{
			kty: 'EC',
			use: 'sig',
			kid: 'a1067a48-a54a-43a0-9758-4d55b51fdd8b',
			crv: 'P-256',
			x: 'yq17Nd2DGcjP1i9I0NN3RBmgSbLQUZOtG6ec5GaqzmU',
			y: 'ieIU9mcfaZwAW5b3WgJkIRgddymG_ckcZ0n1XjbEIvc',
		},
	],
};

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		let redirectToApi = false;

		const API_ROUTES = ['/login', '/profile', '/token', '/now-playing', '/ws', '/oauth-client-metadata.json', '/jwks.json'];

		console.log('Request URL:', url.pathname, url.pathname === '/client-metadata.json');

		if (url.pathname === '/oauth-client-metadata.json') {
			return Response.json(metadata);
		}

		if (url.pathname === '/jwks.json') {
			return Response.json(jwks);
		}

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
			url.pathname.startsWith('/dropbox/oauth/callback') ||
			url.pathname.startsWith('/googledrive/oauth/callback') ||
			url.pathname.startsWith('/dropbox/files') ||
			url.pathname.startsWith('/dropbox/file') ||
			url.pathname.startsWith('/googledrive/files') ||
			url.pathname.startsWith('/dropbox/login') ||
			url.pathname.startsWith('/googledrive/login') ||
			url.pathname.startsWith('/dropbox/join') ||
			url.pathname.startsWith('/googledrive/join') ||
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
