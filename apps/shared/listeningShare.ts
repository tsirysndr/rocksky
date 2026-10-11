export type ListeningSlice = {
	key: string;
	name: string;
	count: number;
	fraction: number;
	start: number;
	color: string;
};
export const shareColors = [
	"#fb3d80",
	"#24bfd3",
	"#a77aff",
	"#f0b852",
	"#54bf91",
	"#8893ab",
];

/** Preserve the API's top-artist ranking. Other uses every scrobble in the
 * matching scope/range, including artists outside the fetched ranking page. */
export function listeningShare(
	artists: { id?: string; uri?: string; name?: string; playCount?: number }[],
	total: number,
): ListeningSlice[] {
	if (!Number.isFinite(total) || total <= 0) return [];
	const top = artists
		.filter((a) => Number.isFinite(a.playCount) && (a.playCount ?? 0) > 0)
		.slice(0, 5)
		.map((a, i) => ({
			key: a.id || a.uri || `artist-${i}`,
			name: a.name || "Unknown artist",
			count: a.playCount!,
		}));
	const rest = total - top.reduce((sum, a) => sum + a.count, 0);
	// Independently cached endpoints can briefly disagree; never invent a
	// denominator or display percentages totalling more than 100%.
	if (rest < 0) return [];
	const rows =
		rest > 0 ? [...top, { key: "other", name: "Other", count: rest }] : top;
	let start = 0;
	return rows.map((row, i) => {
		const fraction = row.count / total;
		const slice = {
			...row,
			fraction,
			start,
			color: row.key === "other" ? shareColors[5] : shareColors[i],
		};
		start += fraction;
		return slice;
	});
}

export function sharePercent(fraction: number) {
	return fraction > 0 && fraction < 0.001
		? "<0.1%"
		: `${Number((fraction * 100).toFixed(1))}%`;
}

/** A 220px pie; use two arcs for a full circle (one SVG arc would be empty). */
export function sharePath({
	start,
	fraction,
}: Pick<ListeningSlice, "start" | "fraction">) {
	if (fraction >= 1)
		return "M110,10 A100,100 0 1,1 110,210 A100,100 0 1,1 110,10 Z";
	const point = (t: number) =>
		`${110 + 100 * Math.cos(t * Math.PI * 2 - Math.PI / 2)},${110 + 100 * Math.sin(t * Math.PI * 2 - Math.PI / 2)}`;
	return `M110,110 L${point(start)} A100,100 0 ${fraction > 0.5 ? 1 : 0},1 ${point(start + fraction)} Z`;
}
