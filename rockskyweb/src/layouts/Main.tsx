import styled from "@emotion/styled";
import { Search } from "@styled-icons/evaicons-solid";
import { Button } from "baseui/button";
import { Input } from "baseui/input";
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

function Main({ children }: { children: React.ReactNode }) {
  const [handle, setHandle] = useState("");
  const { search } = useLocation();
  const jwt = localStorage.getItem("token");

  useEffect(() => {
    const query = new URLSearchParams(search);

    if (query.get("did")) {
      localStorage.setItem("did", query.get("did")!);

      const fetchToken = async () => {
        const response = await fetch(`${API_URL}/token`, {
          method: "GET",
          headers: {
            "session-did": query.get("did")!,
          },
        });
        const data = await response.json();
        localStorage.setItem("token", data.token);

        if (query.get("cli")) {
          try {
            await fetch("http://localhost:6996/token", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ token: data.token }),
            });
          } catch (e) {
            console.error(e);
          }
        }

        window.location.href = "/";
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
      </div>
    </Container>
  );
}

export default Main;
