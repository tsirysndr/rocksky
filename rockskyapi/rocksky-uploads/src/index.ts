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
import jwt from '@tsndr/cloudflare-worker-jwt';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method === 'POST') {
			const formData = await request.formData();
			const file = formData.get('file') as File;

			if (!file) {
				return new Response('No file found in request!', { status: 400 });
			}

			const authorization = request.headers.get('Authorization');
			const token = authorization?.replace('Bearer ', '');

			if (!token) {
				return new Response('No token found in request!', { status: 401 });
			}

			await jwt.verify(token, env.JWT_SECRET);

			const fileBuffer = await file.arrayBuffer();
			const fileName = file.name;

			await env.ROCKSKY_BUCKET.put(`covers/${fileName}`, fileBuffer);

			return new Response('Post operation successful!');
		}

		// return json info about this worker
		return new Response(
			JSON.stringify({
				name: 'RockSky Upload Worker',
				version: '0.1.0',
				description: 'A Cloudflare Worker for uploading files to RockSky',
			}),
			{
				headers: {
					'content-type': 'application/json',
				},
			}
		);
	},
} satisfies ExportedHandler<Env>;
