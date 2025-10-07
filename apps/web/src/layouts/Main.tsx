import styled from "@emotion/styled";
import { useSearch } from "@tanstack/react-router";
import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { PLACEMENT, ToasterContainer } from "baseui/toast";
import { LabelMedium } from "baseui/typography";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { profileAtom } from "../atoms/profile";
import ScrobblesAreaChart from "../components/ScrobblesAreaChart";
import StickyPlayer from "../components/StickyPlayer";
import { API_URL } from "../consts";
import useProfile from "../hooks/useProfile";
import CloudDrive from "./CloudDrive";
import ExternalLinks from "./ExternalLinks";
import Navbar from "./Navbar";
import Search from "./Search";
import SpotifyLogin from "./SpotifyLogin";

const Container = styled.div`
  display: flex;
  justify-content: center;
  height: 100vh;
  overflow-y: auto;
  flex-direction: row;
`;

const Flex = styled.div`
  display: flex;
  width: 770px;
  margin-top: 50px;
  flex-direction: column;
  margin-bottom: 200px;
`;

const RightPane = styled.div`
  @media (max-width: 1152px) {
    display: none;
  }
`;

const Link = styled.a`
  text-decoration: none;
  cursor: pointer;
  display: block;
  font-size: 13px;

  &:hover {
    text-decoration: underline;
  }
`;

export type MainProps = {
	children: React.ReactNode;
	withRightPane?: boolean;
};

function Main(props: MainProps) {
	const { children } = props;
	const withRightPane = props.withRightPane ?? true;
	const [handle, setHandle] = useState("");
	const jwt = localStorage.getItem("token");
	const profile = useAtomValue(profileAtom);
	const [token, setToken] = useState<string | null>(null);
	const { did, cli } = useSearch({ strict: false });

	useEffect(() => {
		if (did && did !== "null") {
			localStorage.setItem("did", did);

			const fetchToken = async () => {
				try {
					const response = await fetch(`${API_URL}/token`, {
						method: "GET",
						headers: {
							"session-did": did,
						},
					});
					const data = await response.json();
					localStorage.setItem("token", data.token);
					setToken(data.token);

					if (cli) {
						await fetch("http://localhost:6996/token", {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ token: data.token }),
						});
					}

					if (!jwt && data.token) {
						window.location.href = "/";
					}
				} catch (e) {
					console.error(e);
				}
			};
			fetchToken();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useProfile(token || localStorage.getItem("token"));

	const onLogin = async () => {
		if (!handle.trim()) {
			return;
		}

		if (API_URL.includes("localhost")) {
			window.location.href = `${API_URL}/login?handle=${handle}`;
			return;
		}

		window.location.href = `https://rocksky.pages.dev/loading?handle=${handle}`;
	};

	return (
		<Container className="bg-[var(--color-background)] text-[var(--color-text)]">
			<ToasterContainer
				placement={PLACEMENT.top}
				overrides={{
					ToastBody: {
						style: {
							zIndex: 2,
							boxShadow: "none",
						},
					},
				}}
			/>
			<Flex style={{ width: withRightPane ? "770px" : "1090px" }}>
				<Navbar />
				<div
					style={{
						position: "relative",
					}}
				>
					{children}
				</div>
			</Flex>
			{withRightPane && (
				<RightPane className="relative w-[300px]">
					<div className="fixed top-[100px] w-[300px] bg-white p-[20px]">
						<div className="mb-[30px]">
							<Search />
						</div>
						{jwt && profile && !profile.spotifyConnected && <SpotifyLogin />}
						{jwt && profile && <CloudDrive />}
						{!jwt && (
							<div className="mt-[40px]">
								<div className="mb-[20px]">
									<div className="mb-[15px]">
										<LabelMedium className="!text-[var(--color-text)]">
											Bluesky handle
										</LabelMedium>
									</div>
									<Input
										name="handle"
										startEnhancer={
											<div className="text-[var(--color-text-muted)] bg-[var(--color-input-background)]">
												@
											</div>
										}
										placeholder="<username>.bsky.social"
										value={handle}
										onChange={(e) => setHandle(e.target.value)}
										overrides={{
											Root: {
												style: {
													backgroundColor: "var(--color-input-background)",
													borderColor: "var(--color-input-background)",
												},
											},
											StartEnhancer: {
												style: {
													backgroundColor: "var(--color-input-background)",
												},
											},
											InputContainer: {
												style: {
													backgroundColor: "var(--color-input-background)",
												},
											},
											Input: {
												style: {
													color: "var(--color-text)",
													caretColor: "var(--color-text)",
												},
											},
										}}
									/>
								</div>
								<Button
									onClick={onLogin}
									overrides={{
										BaseButton: {
											style: {
												width: "100%",
												backgroundColor: "var(--color-primary)",
												":hover": {
													backgroundColor: "var(--color-primary)",
												},
												":focus": {
													backgroundColor: "var(--color-primary)",
												},
											},
										},
									}}
								>
									Sign In
								</Button>
								<LabelMedium className="text-center mt-[20px] !text-[var(--color-text-muted)]">
									Don't have an account?
								</LabelMedium>
								<div className="text-center text-[var(--color-text-muted)] ">
									<a
										href="https://bsky.app"
										className="no-underline cursor-pointer !text-[var(--color-primary)]"
										target="_blank"
									>
										Sign up for Bluesky
									</a>{" "}
									to create one now!
								</div>
							</div>
						)}

						<div className="mt-[40px]">
							<ScrobblesAreaChart />
						</div>
						<ExternalLinks />
						<div className="inline-flex mt-[40px]">
							<Link
								href="https://docs.rocksky.app/introduction-918639m0"
								target="_blank"
								className="mr-[10px] text-[var(--color-primary)]"
							>
								About
							</Link>
							<Link
								href="https://docs.rocksky.app/faq-918661m0"
								target="_blank"
								className="mr-[10px] text-[var(--color-primary)]"
							>
								FAQ
							</Link>
							<Link
								href="https://doc.rocksky.app/"
								target="_blank"
								className="mr-[10px] text-[var(--color-primary)]"
							>
								API Docs
							</Link>

							<Link
								href="https://discord.gg/EVcBy2fVa3"
								target="_blank"
								className="text-[var(--color-primary)]"
							>
								Discord
							</Link>
							<Link
								href="https://tangled.org/@rocksky.app/rocksky"
								target="_blank"
								className="text-[var(--color-primary)]"
							>
								Source
							</Link>
						</div>
					</div>
				</RightPane>
			)}
			<StickyPlayer />
		</Container>
	);
}

export default Main;
