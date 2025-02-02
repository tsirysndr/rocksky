import styled from "@emotion/styled";
import { Search } from "@styled-icons/evaicons-solid";
import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { LabelMedium } from "baseui/typography";
import { useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { profileAtom } from "../atoms/profile";
import { API_URL } from "../consts";
import Navbar from "./Navbar";

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

function Main({ children }: { children: React.ReactNode }) {
  const [handle, setHandle] = useState("");
  const { search } = useLocation();
  const setProfile = useSetAtom(profileAtom);
  const did = useMemo(() => {
    const query = new URLSearchParams(search);
    if (query.get("did")) {
      localStorage.setItem("did", query.get("did")!);
      return query.get("did");
    }

    if (localStorage.getItem("did")) {
      return localStorage.getItem("did");
    }

    return query.get("did");
  }, [search]);

  useEffect(() => {
    const getProfile = async () => {
      const response = await fetch(`${API_URL}/profile`, {
        method: "GET",
        headers: {
          "session-did": did!,
        },
      });
      if (response.status !== 200 && did) {
        localStorage.removeItem("did");
        window.location.href = "/";
        return;
      }
      const data = await response.json();
      setProfile({
        avatar: `https://cdn.bsky.app/img/avatar/plain/${did}/${data.avatar.ref["$link"]}@jpeg`,
        displayName: data.displayName,
        handle: data.handle,
      });
    };

    getProfile();
  }, []);

  const onLogin = async () => {
    if (!handle.trim()) {
      return;
    }

    const response = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ handle }),
    });
    console.log(response);
    const redirectUrl = response.url;
    if (redirectUrl) {
      window.location.href = redirectUrl; // Manually redirect the browser
    }
  };

  return (
    <Container>
      <Flex>
        <Navbar />
        {children}
      </Flex>
      <div style={{ position: "relative", width: 300 }}>
        <div
          style={{
            position: "fixed",
            top: 100,
            width: 300,
            padding: 20,
          }}
        >
          <div>
            <Input
              startEnhancer={<Search size={20} color="#42576ca6" />}
              placeholder="Search"
              clearable
              clearOnEscape
            />
          </div>
          {!did && (
            <div style={{ marginTop: 40 }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ marginBottom: 15 }}>
                  <LabelMedium>Bluesky handle</LabelMedium>
                </div>
                <Input
                  name="handle"
                  startEnhancer={<div style={{ color: "#42576ca6" }}>@</div>}
                  placeholder="<username>.bsky.social"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
              </div>
              <Button
                onClick={onLogin}
                overrides={{
                  BaseButton: {
                    style: {
                      width: "100%",
                      backgroundColor: "#ff2876",
                      ":hover": {
                        backgroundColor: "#ff2876",
                      },
                      ":focus": {
                        backgroundColor: "#ff2876",
                      },
                    },
                  },
                }}
              >
                Sign In
              </Button>
              <LabelMedium
                marginTop={"20px"}
                style={{
                  textAlign: "center",
                  color: "#42576ca6",
                }}
              >
                Don't have an account?
              </LabelMedium>
              <div
                style={{
                  color: "#42576ca6",
                }}
              >
                <a
                  href="https://bsky.app"
                  style={{
                    color: "#ff2876",
                    textDecoration: "none",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  Sign up for Bluesky
                </a>{" "}
                to create one now!
              </div>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

export default Main;
