import { useState } from "react";
import {
	sharePath,
	sharePercent,
	type ListeningSlice,
} from "../listeningShare";

export default function ListeningPie({ slices }: { slices: ListeningSlice[] }) {
	const [selected, setSelected] = useState<string | null>(null);
	const active = slices.find((slice) => slice.key === selected);
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				flexWrap: "wrap",
				gap: 24,
			}}
		>
			<svg
				viewBox="0 0 220 220"
				width={220}
				height={220}
				role="img"
				aria-label="Listening share by artist; counts and percentages in the legend"
				style={{ maxWidth: "100%", flexShrink: 0 }}
			>
				{slices.map((slice) => (
					<path
						key={slice.key}
						d={sharePath(slice)}
						fill={slice.color}
						stroke="var(--color-background, #130825)"
						strokeWidth={0.5}
						opacity={active && active.key !== slice.key ? 0.35 : 1}
						onMouseEnter={() => setSelected(slice.key)}
						onMouseLeave={() => setSelected(null)}
						onClick={() => setSelected(slice.key)}
					>
						<title>
							{slice.name}: {slice.count.toLocaleString()} scrobbles (
							{sharePercent(slice.fraction)})
						</title>
					</path>
				))}
			</svg>
			<ul
				aria-label="Artist listening shares"
				style={{
					listStyle: "none",
					padding: 0,
					margin: 0,
					flex: "1 1 220px",
					minWidth: 0,
				}}
			>
				{slices.map((slice) => (
					<li key={slice.key}>
						<button
							type="button"
							aria-pressed={selected === slice.key}
							onClick={() =>
								setSelected(selected === slice.key ? null : slice.key)
							}
							style={{
								display: "flex",
								width: "100%",
								alignItems: "center",
								gap: 10,
								padding: "10px 4px",
								border: 0,
								borderRadius: 8,
								background:
									selected === slice.key
										? "var(--color-surface-2)"
										: "transparent",
								color: "var(--color-text)",
								cursor: "pointer",
								textAlign: "left",
								font: "inherit",
								fontSize: 13,
							}}
						>
							<span
								aria-hidden
								style={{
									width: 10,
									height: 10,
									borderRadius: "50%",
									background: slice.color,
									flexShrink: 0,
								}}
							/>
							<span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
								{slice.name}
							</span>
							<span
								style={{
									color: "var(--color-text-muted)",
									textAlign: "right",
									flexShrink: 0,
								}}
							>
								{slice.count.toLocaleString()}
								<br />
								<strong style={{ color: "var(--color-text)" }}>
									{sharePercent(slice.fraction)}
								</strong>
							</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}
