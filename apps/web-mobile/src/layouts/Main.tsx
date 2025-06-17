import styled from "@emotion/styled";
import { PLACEMENT, ToasterContainer } from "baseui/toast";
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
  max-width: 770px;
  margin-top: 50px;
  flex-direction: column;
  margin-bottom: 200px;
  height: 100vh;
`;

function Main({ children }: { children: React.ReactNode }) {
  const { search } = useLocation();
  const jwt = localStorage.getItem("token");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(search);
    const did = query.get("did");

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
      };
      fetchToken();
    }
  }, [search]);

  useProfile(token || localStorage.getItem("token"));

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
    </Container>
  );
}

export default Main;
