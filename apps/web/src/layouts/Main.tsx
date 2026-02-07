import styled from "@emotion/styled";
import { useSearch } from "@tanstack/react-router";
import { PLACEMENT, ToasterContainer } from "baseui/toast";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { profileAtom } from "../atoms/profile";
import ScrobblesAreaChart from "../components/ScrobblesAreaChart";
import StickyPlayer from "../components/StickyPlayer";
import { API_URL } from "../consts";
import useProfile from "../hooks/useProfile";
import CloudDrive from "./CloudDrive";
import Navbar from "./Navbar";
import Search from "./Search";
import SpotifyLogin from "./SpotifyLogin";
import { consola } from "consola";
import { displayDrawerAtom } from "../atoms/drawer";

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

const Drawer = styled.div`
  @media (max-width: 1152px) {
    display: block;
  }

  @media (min-width: 1153px) {
    display: none;
  }
`;

export type MainProps = {
  children: React.ReactNode;
  withRightPane?: boolean;
};

import LoginForm from "./LoginForm";
import ExternalLinks from "./ExternalLinks";
import Links from "./Links";

function Main(props: MainProps) {
  const { children } = props;
  const displayDrawer = useAtomValue(displayDrawerAtom);
  const withRightPane = props.withRightPane ?? true;
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const jwt = localStorage.getItem("token");
  const profile = useAtomValue(profileAtom);
  const [token, setToken] = useState<string | null>(null);
  const { did, cli } = useSearch({ strict: false });
  const [passwordLogin, setPasswordLogin] = useState(false);

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
          consola.error(e);
        }
      };
      fetchToken();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useProfile(token || localStorage.getItem("token"));

  const onLogin = async (prompt?: string) => {
    if (!handle.trim() && !prompt) {
      return;
    }

    if (passwordLogin) {
      if (!password.trim()) {
        return;
      }

      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ handle, password }),
      });

      if (!response.ok) {
        const error = await response.text();
        alert(error);
        return;
      }

      const data = await response.text();
      const newToken = data.split("jwt:")[1];
      localStorage.setItem("token", newToken);
      setToken(data);

      if (cli) {
        await fetch("http://localhost:6996/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: newToken }),
        });
      }

      if (!jwt && newToken) {
        window.location.href = "/";
      }

      return;
    }

    if (API_URL.includes("localhost")) {
      window.location.href = prompt
        ? `${API_URL}/login?handle=${handle}&prompt=${prompt}`
        : `${API_URL}/login?handle=${handle}`;
      return;
    }

    window.location.href = prompt
      ? `https://rocksky.pages.dev/loading?prompt=${prompt}`
      : `https://rocksky.pages.dev/loading?handle=${handle}`;
  };

  const onCreateAccount = async () => {
    await onLogin("create");
  };

  return (
    <Container
      id="app-container"
      className="bg-[var(--color-background)] text-[var(--color-text)]"
    >
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
      <Navbar />

      <Flex style={{ width: withRightPane ? "770px" : "1090px" }}>
        {!displayDrawer && <div className="relative">{children}</div>}
        {displayDrawer && (
          <Drawer>
            <div className="fixed top-[100px] h-[calc(100vh-100px)] w-[calc(100%-100px)] bg-white p-[20px] overflow-y-auto pt-[0px]">
              {jwt && profile && (
                <div className="mb-[30px]">
                  <Search />
                </div>
              )}
              {jwt && profile && !profile.spotifyConnected && <SpotifyLogin />}
              {jwt && profile && <CloudDrive />}
              {!jwt && (
                <div className="mt-[40px] max-w-[770px]">
                  <LoginForm
                    handle={handle}
                    setHandle={setHandle}
                    password={password}
                    setPassword={setPassword}
                    passwordLogin={passwordLogin}
                    setPasswordLogin={setPasswordLogin}
                    onLogin={onLogin}
                    onCreateAccount={onCreateAccount}
                  />
                </div>
              )}
              <ExternalLinks />
            </div>
          </Drawer>
        )}
      </Flex>
      {withRightPane && (
        <RightPane className="relative w-[300px]">
          <div className="fixed top-[100px] h-[calc(100vh-100px)] w-[300px] bg-white p-[20px] overflow-y-auto pt-[0px]">
            <div className="mb-[30px]">
              <Search />
            </div>
            {jwt && profile && !profile.spotifyConnected && <SpotifyLogin />}
            {jwt && profile && <CloudDrive />}
            {!jwt && (
              <div className="mt-[40px]">
                <LoginForm
                  handle={handle}
                  setHandle={setHandle}
                  password={password}
                  setPassword={setPassword}
                  passwordLogin={passwordLogin}
                  setPasswordLogin={setPasswordLogin}
                  onLogin={onLogin}
                  onCreateAccount={onCreateAccount}
                />
              </div>
            )}

            <div className="mt-[40px]">
              <ScrobblesAreaChart />
            </div>
            <ExternalLinks />
            <Links />
          </div>
        </RightPane>
      )}
      <StickyPlayer />
    </Container>
  );
}

export default Main;
