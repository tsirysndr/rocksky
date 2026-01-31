export type OgTarget =
	| { kind: 'profile'; handle: string }
	| { kind: 'scrobble'; did: string; rkey: string }
	| { kind: 'album'; did: string; rkey: string }
	| { kind: 'artist'; did: string; rkey: string }
	| { kind: 'song'; did: string; rkey: string }
	| null;

export function matchOgTarget(pathname: string): OgTarget {
	let m = pathname.match(/^\/profile\/([^/]+)$/);
	if (m) return { kind: 'profile', handle: decodeURIComponent(m[1]) };

	m = pathname.match(/^\/(did:plc:[^/]+)\/(scrobble|album|artist|song)\/([^/]+)$/);
	if (m) {
		const did = decodeURIComponent(m[1]);
		const kind = m[2] as 'scrobble' | 'album' | 'artist' | 'song';
		const rkey = decodeURIComponent(m[3]);
		if (kind === 'song') return { kind: 'song', did, rkey };
		if (kind === 'album') return { kind: 'album', did, rkey };
		if (kind === 'artist') return { kind: 'artist', did, rkey };
		return { kind: 'scrobble', did, rkey };
	}

	return null;
}

export type OgData = {
	title: string;
	description: string;
	image: string;
	url: string;
	type?: string; // og:type
	twitterCard?: 'summary' | 'summary_large_image';
};

export async function fetchOgData(url: URL, request: Request): Promise<OgData | null> {
	const api = new URL('https://api.rocksky.app/public/og');
	api.searchParams.set('path', url.pathname);

	const res = await fetch(api.toString());

	if (!res.ok) {
		console.log(res.statusText);
		console.log(await res.text());
		return null;
	}

	const og = (await res.json<OgData>()) as OgData;
	og.url ??= url.toString();
	og.type ??= 'website';
	og.twitterCard ??= 'summary_large_image';
	return og;
}

function escapeAttr(s: string) {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class StripMeta {
	element(el: Element) {
		el.remove();
	}
}

export function isHtmlResponse(res: Response) {
	const ct = res.headers.get('content-type') || '';
	return ct.toLowerCase().includes('text/html');
}

export class HeadMeta {
	private og: OgData;
	constructor(og: OgData) {
		this.og = og;
	}

	element(head: Element) {
		const tags = [
			`<title>${escapeAttr(this.og.title)}</title>`,
			`<meta name="description" content="${escapeAttr(this.og.description)}">`,

			`<meta property="og:title" content="${escapeAttr(this.og.title)}">`,
			`<meta property="og:description" content="${escapeAttr(this.og.description)}">`,
			`<meta property="og:image" content="${escapeAttr(this.og.image)}">`,
			`<meta property="og:url" content="${escapeAttr(this.og.url)}">`,
			`<meta property="og:type" content="${escapeAttr(this.og.type ?? 'website')}">`,

			`<meta name="twitter:card" content="${escapeAttr(this.og.twitterCard ?? 'summary_large_image')}">`,
			`<meta name="twitter:title" content="${escapeAttr(this.og.title)}">`,
			`<meta name="twitter:description" content="${escapeAttr(this.og.description)}">`,
			`<meta name="twitter:image" content="${escapeAttr(this.og.image)}">`,
		].join('\n');

		head.append(tags, { html: true });
	}
}
