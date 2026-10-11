import { expect, test } from "bun:test";
import { listeningShare, sharePath, sharePercent } from "./listeningShare";

test("Other includes listens beyond the ranking page, with exactly five artists", () => {
	const rows = listeningShare(
		Array.from({ length: 10 }, (_, i) => ({
			id: `${i}`,
			name: `Artist ${i}`,
			playCount: 10,
		})),
		200,
	);
	expect(rows).toHaveLength(6);
	expect(rows[5].count).toBe(150);
	expect(rows.reduce((sum, row) => sum + row.fraction, 0)).toBeCloseTo(1);
});
test("empty, invalid, and temporarily inconsistent totals do not make misleading pies", () => {
	expect(listeningShare([], 0)).toEqual([]);
	expect(listeningShare([], NaN)).toEqual([]);
	expect(listeningShare([{ playCount: 11 }], 10)).toEqual([]);
	expect(
		listeningShare([{ playCount: -1 }, { playCount: NaN }], 10)[0].name,
	).toBe("Other");
});
test("single artist can fill the pie without an empty Other segment", () => {
	const rows = listeningShare([{ name: "Solo", playCount: 10 }], 10);
	expect(rows).toHaveLength(1);
	expect(rows[0].fraction).toBe(1);
	expect(sharePath(rows[0]).match(/A100/g)).toHaveLength(2);
	expect(sharePercent(0.00001)).toBe("<0.1%");
});
