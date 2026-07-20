import { RockskyClient } from "client";
import { Box, Text, useInput } from "ink";
import { useAtom } from "jotai";
import React, { useEffect, useState } from "react";
import { signIn, signOut } from "./auth";
import { authAtom, authOpenAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

export function AuthView() {
  const [, setOpen] = useAtom(authOpenAtom);
  const [auth, setAuth] = useAtom(authAtom);
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    new RockskyClient(auth)
      .getCurrentUser()
      .then((u: any) => setWho(u.handle || u.did))
      .catch(() => setWho(null));
  }, [auth]);

  useInput((input, key) => {
    if (key.escape) return setOpen(false);
    if (busy) return;

    if (auth) {
      if (key.return) {
        setBusy(true);
        setStatus("Signing out…");
        signOut().then(() => {
          setAuth(undefined);
          setOpen(false);
        });
      }
      return;
    }

    // Signed out → collect handle and start the login flow.
    if (key.return) {
      const h = handle.trim();
      if (!h) return;
      setBusy(true);
      signIn(h, setStatus)
        .then((token) => {
          setAuth(token);
          setOpen(false);
        })
        .catch((e) => {
          setStatus(`Error: ${e.message}`);
          setBusy(false);
        });
      return;
    }
    if (key.backspace || key.delete) return setHandle((h) => h.slice(0, -1));
    if (input && input >= " " && !key.ctrl && !key.meta)
      setHandle((h) => h + input);
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={BLUE}>
        {" Account "}
      </Text>

      {auth ? (
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text dimColor>Signed in as </Text>
            <Text bold color={VIOLET}>
              {who ? `@${who}` : "…"}
            </Text>
          </Text>
          <Box marginTop={1}>
            <Text dimColor>{busy ? status : "Enter to sign out · Esc cancel"}</Text>
          </Box>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Enter your AT Proto handle to sign in:</Text>
          <Box marginTop={1}>
            <Text color={TEAL}>{"handle "}</Text>
            <Text>{handle}</Text>
            <Text color={BLUE}>▏</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              {busy ? status : "e.g. you.bsky.social · Enter to continue · Esc cancel"}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
