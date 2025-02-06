import styled from "@emotion/styled";
import { Search } from "@styled-icons/evaicons-solid";
import { Button } from "baseui/button";
import { Input } from "baseui/input";
import { PLACEMENT, toaster, ToasterContainer } from "baseui/toast";
import { LabelMedium } from "baseui/typography";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { API_URL } from "../consts";
import useProfile from "../hooks/useProfile";
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

const RightPane = styled.div`
  @media (max-width: 1152px) {
    display: none;
  }
`;

function Main({ children }: { children: React.ReactNode }) {
  const [handle, setHandle] = useState("");
  const { search } = useLocation();
  const jwt = localStorage.getItem("token");

  useEffect(() => {
    const query = new URLSearchParams(search);
    const did = query.get("did");

    if (did) {
      localStorage.setItem("did", did);

      const fetchToken = async () => {
        try {
          const response = await fetch(`${API_URL}/token`, {
            method: "GET",
            headers: {
              "session-did": localStorage.getItem("did")!,
            },
          });
          const data = await response.json();
          localStorage.setItem("token", data.token);

          if (query.get("cli")) {
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

        // window.location.href = "/";
      };
      fetchToken();
    }
  }, [search]);

  useProfile();

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

    if ((await response.text()).startsWith("Invalid")) {
      toaster.negative("Invalid Bluesky handle", {});
      return;
    }

    const redirectUrl = response.url;
    if (redirectUrl) {
      window.location.href = redirectUrl; // Manually redirect the browser
    }
  };

  return (
    <Container>
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
      <Flex>
        <Navbar />
        {children}
      </Flex>
      <RightPane style={{ position: "relative", width: 300 }}>
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
          {!jwt && (
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
                  target="_blank"
                >
                  Sign up for Bluesky
                </a>{" "}
                to create one now!
              </div>
            </div>
          )}
        </div>
      </RightPane>
    </Container>
  );
}

export default Main;
