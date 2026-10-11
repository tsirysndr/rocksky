import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import { useState } from "react";
import ListeningPie from "../../../../shared/browser/ListeningPie";
import { listeningShare } from "../../../../shared/listeningShare";
import { profileAtom } from "../../atoms/profile";
import Main from "../../layouts/Main";
import { rocksky } from "../../lib/rocksky";

const presets = [7, 30, 90, 365, 0];
export default function Analytics() {
	const profile = useAtomValue(profileAtom);
	const ownDid = profile?.did || localStorage.getItem("did") || undefined;
	const [scope, setScope] = useState("mine");
	const [from, setFrom] = useState(() =>
		dayjs().subtract(29, "day").format("YYYY-MM-DD"),
	);
	const [to, setTo] = useState(() => dayjs().format("YYYY-MM-DD"));
	const did = scope === "mine" ? ownDid : undefined;
	const valid =
		[from, to].every(
			(date) =>
				/^\d{4}-\d{2}-\d{2}$/.test(date) &&
				dayjs(date).format("YYYY-MM-DD") === date,
		) && from <= to;
	const daily = useQuery({
		queryKey: ["analytics", "daily", did, from, to],
		queryFn: () => rocksky().scrobblesChart({ did, from, to }),
		enabled: valid,
		staleTime: 60000,
	});
	const artists = useQuery({
		queryKey: ["analytics", "artists", did, from, to],
		queryFn: () =>
			rocksky().topArtistsInterval(
				5,
				0,
				{ startDate: `${from}T00:00:00.000Z`, endDate: `${to}T23:59:59.999Z` },
				did,
			),
		enabled: valid,
		staleTime: 60000,
	});
	const total = (daily.data?.scrobbles ?? []).reduce(
		(sum, row) => sum + Math.max(0, Number(row.count) || 0),
		0,
	);
	const slices = listeningShare(artists.data ?? [], total);
	const loading = daily.isLoading || artists.isLoading;
	const failed = daily.isError || artists.isError;
	const refresh = () => {
		void daily.refetch();
		void artists.refetch();
	};
	const buttonStyle = {
		border: "1px solid var(--color-border)",
		borderRadius: 18,
		padding: "7px 12px",
		background: "var(--color-surface-2)",
		color: "var(--color-text)",
		font: "inherit",
		fontSize: 12,
		cursor: "pointer",
	};
	return (
		<Main>
			<div style={{ padding: "24px 16px 110px", color: "var(--color-text)" }}>
				<h1 style={{ margin: "0 0 8px", fontSize: 26 }}>Analytics</h1>
				<p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
					{did
						? `Listening for @${profile?.handle || "you"}`
						: "Listening across Rocksky."}
				</p>
				{ownDid && (
					<div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
						{[
							["mine", "My listening"],
							["global", "All of Rocksky"],
						].map(([value, label]) => (
							<button
								key={value}
								type="button"
								aria-pressed={scope === value}
								onClick={() => setScope(value)}
								style={{
									...buttonStyle,
									background:
										scope === value
											? "var(--color-primary)"
											: buttonStyle.background,
									color: scope === value ? "#fff" : buttonStyle.color,
								}}
							>
								{label}
							</button>
						))}
					</div>
				)}
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 8,
						marginBottom: 16,
					}}
				>
					{presets.map((days) => (
						<button
							type="button"
							key={days}
							style={buttonStyle}
							onClick={() => {
								setFrom(
									days
										? dayjs()
												.subtract(days - 1, "day")
												.format("YYYY-MM-DD")
										: "2000-01-01",
								);
								setTo(dayjs().format("YYYY-MM-DD"));
							}}
						>
							{days === 0
								? "All time"
								: days === 365
									? "12 months"
									: `${days} days`}
						</button>
					))}
				</div>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 12,
						marginBottom: 24,
					}}
				>
					<label style={{ flex: "1 1 130px", fontSize: 12 }}>
						From
						<input
							type="date"
							value={from}
							max={to || undefined}
							onChange={(event) => setFrom(event.target.value)}
							style={{
								...buttonStyle,
								display: "block",
								width: "100%",
								boxSizing: "border-box",
								marginTop: 6,
							}}
						/>
					</label>
					<label style={{ flex: "1 1 130px", fontSize: 12 }}>
						To
						<input
							type="date"
							value={to}
							min={from || undefined}
							onChange={(event) => setTo(event.target.value)}
							style={{
								...buttonStyle,
								display: "block",
								width: "100%",
								boxSizing: "border-box",
								marginTop: 6,
							}}
						/>
					</label>
				</div>
				<section
					aria-labelledby="listening-share-title"
					style={{
						padding: 18,
						border: "1px solid var(--color-border)",
						borderRadius: 16,
						background: "var(--color-surface)",
					}}
				>
					<h2
						id="listening-share-title"
						style={{ fontSize: 18, margin: "0 0 8px" }}
					>
						Listening share
					</h2>
					<p
						style={{
							color: "var(--color-text-muted)",
							fontSize: 12,
							margin: "0 0 18px",
						}}
					>
						{did
							? "Top 5 artists + Other · Share of scrobbles in this period."
							: "Top 5 artists by listeners + Other · Share of scrobbles."}{" "}
						Dates use UTC.
					</p>
					{!valid ? (
						<p role="status">Choose a valid date range.</p>
					) : loading ? (
						<p role="status">Loading listening data…</p>
					) : failed ? (
						<p role="alert">
							This chart could not load.{" "}
							<button type="button" style={buttonStyle} onClick={refresh}>
								Try again
							</button>
						</p>
					) : !total ? (
						<p>No listening data in this period.</p>
					) : slices.length ? (
						<>
							<p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
								{total.toLocaleString()} scrobbles
							</p>
							<ListeningPie key={`${did}-${from}-${to}`} slices={slices} />
						</>
					) : (
						<p>
							Listening totals are updating.{" "}
							<button type="button" style={buttonStyle} onClick={refresh}>
								Refresh
							</button>
						</p>
					)}
				</section>
			</div>
		</Main>
	);
}
