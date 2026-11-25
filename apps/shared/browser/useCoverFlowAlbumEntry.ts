import { useCallback, useEffect, useRef } from "react";

/** Animate before removing the modal from the browser's top layer. */
export async function animateAlbumEntry(
	screen: HTMLElement,
	albumId: string,
	signal: AbortSignal,
): Promise<void> {
	if (
		signal.aborted ||
		window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
		typeof screen.animate !== "function"
	)
		return;

	const covers = Array.from(
		screen.querySelectorAll<HTMLElement>("[data-cover-album]"),
	);
	const cover = covers.find((item) => item.dataset.coverAlbum === albumId);
	if (!cover) return;

	const animations: Animation[] = [];
	const previousZIndex = cover.style.zIndex;
	const cancel = () => animations.forEach((animation) => animation.cancel());
	signal.addEventListener("abort", cancel, { once: true });
	try {
		cover.style.zIndex = "30";
		animations.push(
			cover.animate(
				[
					{
						transform: getComputedStyle(cover).transform,
						filter: getComputedStyle(cover).filter,
					},
					{
						transform:
							"translate(-50%, -50%) translateZ(260px) rotateY(0deg) scale(1.12)",
						filter: "brightness(1)",
					},
				],
				{
					duration: 320,
					easing: "cubic-bezier(.2,.75,.2,1)",
					fill: "forwards",
				},
			),
		);
		for (const sibling of covers) {
			if (sibling !== cover)
				animations.push(
					sibling.animate(
						[{ opacity: getComputedStyle(sibling).opacity }, { opacity: 0 }],
						{ duration: 180, fill: "forwards" },
					),
				);
		}
		animations.push(
			screen.animate(
				[{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }],
				{ duration: 320, easing: "ease-in", fill: "forwards" },
			),
		);
		await Promise.all(animations.map((animation) => animation.finished));
	} finally {
		signal.removeEventListener("abort", cancel);
		cancel();
		cover.style.zIndex = previousZIndex;
	}
}

export function useCoverFlowAlbumEntry() {
	const pending = useRef<AbortController | null>(null);
	const cancelEntry = useCallback(() => {
		pending.current?.abort();
		pending.current = null;
	}, []);
	useEffect(() => cancelEntry, [cancelEntry]);

	const enterAlbum = useCallback(
		async (
			screen: HTMLElement | null,
			albumId: string,
			onEnter: () => void,
		) => {
			if (pending.current) return;
			const controller = new AbortController();
			pending.current = controller;
			try {
				if (screen) await animateAlbumEntry(screen, albumId, controller.signal);
			} catch {
				// Animation support must never prevent opening an album.
			} finally {
				if (!controller.signal.aborted) onEnter();
				if (pending.current === controller) pending.current = null;
			}
		},
		[],
	);

	return { enterAlbum, cancelEntry, entering: pending };
}
