/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { Resend } from 'resend';
import z from 'zod';

const schema = z.object({
	email: z.string().email(),
});

type Payload = z.infer<typeof schema>;

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', {
				status: 405,
				headers: { 'content-type': 'text/plain' },
			});
		}

		// verify bearer token
		const auth = request.headers.get('Authorization');
		if (!auth || auth.split(' ')[1] !== env.BEARER_TOKEN) {
			return new Response('Unauthorized', {
				status: 401,
				headers: { 'content-type': 'text/plain' },
			});
		}

		// Get the request body and validate it
		const body = await request.json();
		const payload = schema.parse(body) as Payload;

		const resend = new Resend(env.RESEND_API_KEY);
		await resend.emails.send({
			from: 'beta@rocksky.app',
			to: ['tsiry.sndr@gmail.com'],
			subject: 'New beta user registered',
			html: `<p>Hi, a new user has registered for the beta version of Rocksky: <strong>${payload.email}</strong></p>`,
		});
		return new Response('Email sent!', {
			headers: { 'content-type': 'text/plain' },
		});
	},
} satisfies ExportedHandler<Env>;
