import { Link } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { Block } from "baseui/block";
import { StatefulPopover, TRIGGER_TYPE } from "baseui/popover";
import { LabelMedium, LabelSmall } from "baseui/typography";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { profilesAtom } from "../../atoms/profiles";
import { statsAtom } from "../../atoms/stats";
import {
	useProfileByDidQuery,
	useProfileStatsByDidQuery,
} from "../../hooks/useProfile";
import Stats from "../Stats";
import NowPlaying from "./NowPlaying";

export type HandleProps = {
	link: string;
	did: string;
};

function Handle(props: HandleProps) {
	const { link, did } = props;
	const [profiles, setProfiles] = useAtom(profilesAtom);
	const profile = useProfileByDidQuery(did);
	const profileStats = useProfileStatsByDidQuery(did);
	const [stats, setStats] = useAtom(statsAtom);

	useEffect(() => {
		if (profile.isLoading || profile.isError) {
			return;
		}

		if (!profile.data || !did) {
			return;
		}

		setProfiles((profiles) => ({
			...profiles,
			[did]: {
				avatar: profile.data.avatar,
				displayName: profile.data.displayName,
				handle: profile.data.handle,
				spotifyConnected: profile.data.spotifyConnected,
				createdAt: profile.data.createdAt,
				did,
			},
		}));

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [profile.data, profile.isLoading, profile.isError, did]);

	useEffect(() => {
		if (profileStats.isLoading || profileStats.isError) {
			return;
		}

		if (!profileStats.data || !did) {
			return;
		}

		setStats((prev) => ({
			...prev,
			[did]: {
				scrobbles: profileStats.data.scrobbles,
				artists: profileStats.data.artists,
				lovedTracks: profileStats.data.lovedTracks,
				albums: profileStats.data.albums,
				tracks: profileStats.data.tracks,
			},
		}));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [profileStats.data, profileStats.isLoading, profileStats.isError, did]);

	return (
		<StatefulPopover
			content={() => (
				<Block className="!bg-[var(--color-background)] !text-[var(--color-text)] p-[15px] w-[380px] rounded-[6px] border-[1px] border-[var(--color-border)]">
					<div className="flex flex-row items-center">
						<Link to={link} className="no-underline">
							<Avatar
								src={profiles[did]?.avatar}
								name={profiles[did]?.displayName}
								size={"60px"}
							/>
						</Link>
						<div className="ml-[16px]">
							<Link to={link} className="no-underline">
								<LabelMedium
									marginTop={"10px"}
									className="!text-[var(--color-text)]"
								>
									{profiles[did]?.displayName}
								</LabelMedium>
							</Link>
							<a
								href={`https://bsky.app/profile/${profiles[did]?.handle}`}
								className="no-underline text-[var(--color-primary)]"
							>
								<LabelSmall className="!text-[var(--color-primary)] mt-[3px] mb-[25px]">
									@{did}
								</LabelSmall>
							</a>
						</div>
					</div>

					{stats[did] && <Stats stats={stats[did]} mb={1} />}

					<NowPlaying did={did} />
				</Block>
			)}
			triggerType={TRIGGER_TYPE.hover}
			autoFocus={false}
			focusLock={false}
		>
			<Link to={link} className="no-underline">
				<LabelMedium className="!text-[var(--color-primary)] !overflow-hidden !text-ellipsis !max-w-[220px] !text-[14px]">
					@{did}
				</LabelMedium>
			</Link>
		</StatefulPopover>
	);
}

export default Handle;
