import { afterEach, expect, it, vi } from "vitest";
import { animateAlbumEntry } from "./useCoverFlowAlbumEntry";

afterEach(() => vi.unstubAllGlobals());

function scene(reduced = false) {
	const animations: {
		finished: Promise<void>;
		cancel: ReturnType<typeof vi.fn>;
		finish: () => void;
	}[] = [];
	const animate = vi.fn(() => {
		let finish!: () => void;
		let reject!: (error: Error) => void;
		const finished = new Promise<void>((resolve, fail) => {
			finish = resolve;
			reject = fail;
		});
		const animation = {
			finished,
			finish,
			cancel: vi.fn(() => reject(new Error("cancelled"))),
		};
		animations.push(animation);
		return animation;
	});
	const selected = {
		dataset: { coverAlbum: "album" },
		style: { zIndex: "10" },
		animate,
	};
	const other = {
		dataset: { coverAlbum: "other" },
		style: { zIndex: "9" },
		animate,
	};
	const screen = {
		querySelectorAll: () => [selected, other],
		animate,
	} as unknown as HTMLElement;
	vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
	vi.stubGlobal("getComputedStyle", () => ({
		transform: "matrix(1,0,0,1,0,0)",
		filter: "none",
		opacity: "1",
	}));
	return { screen, selected, animate, animations };
}

it("waits for the cover transition and restores temporary styles", async () => {
	const { screen, selected, animations } = scene();
	let done = false;
	const pending = animateAlbumEntry(
		screen,
		"album",
		new AbortController().signal,
	).then(() => {
		done = true;
	});
	await Promise.resolve();
	expect(done).toBe(false);
	expect(selected.style.zIndex).toBe("30");
	for (const animation of animations) animation.finish();
	await pending;
	expect(done).toBe(true);
	expect(selected.style.zIndex).toBe("10");
	expect(
		animations.every((animation) => animation.cancel.mock.calls.length > 0),
	).toBe(true);
});

it("cancels all animations when the user exits during entry", async () => {
	const { screen, selected, animations } = scene();
	const controller = new AbortController();
	const pending = animateAlbumEntry(screen, "album", controller.signal);
	controller.abort();
	await expect(pending).rejects.toThrow("cancelled");
	expect(selected.style.zIndex).toBe("10");
	expect(
		animations.every((animation) => animation.cancel.mock.calls.length > 0),
	).toBe(true);
});

it("opens immediately for reduced motion or missing browser animation support", async () => {
	const { screen, animate } = scene(true);
	await animateAlbumEntry(screen, "album", new AbortController().signal);
	expect(animate).not.toHaveBeenCalled();
	scene();
	await animateAlbumEntry(
		{} as HTMLElement,
		"album",
		new AbortController().signal,
	);
});
