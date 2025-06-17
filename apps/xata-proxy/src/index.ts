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
		const proxyUrl = new URL(request.url);
		proxyUrl.host = "Tsiry-Sandratraina-s-workspace-b1ficn.us-east-1.xata.sh";
		proxyUrl.hostname =
			"Tsiry-Sandratraina-s-workspace-b1ficn.us-east-1.xata.sh";
		return fetch(proxyUrl, request) as any;
	},
} satisfies ExportedHandler<Env>;
