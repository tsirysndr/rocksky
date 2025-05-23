import { equals } from "@xata.io/client";
import axios from "axios";
import { ctx } from "context";
import { Hono } from "hono";
import jwt from "jsonwebtoken";
import { encrypt } from "lib/crypto";
import { env } from "lib/env";
import { requestCounter } from "metrics";
import { emailSchema } from "types/email";

const app = new Hono();

app.get("/login", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/dropbox/login" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const clientId = env.DROPBOX_CLIENT_ID;
  const redirectUri = `https://www.dropbox.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${env.DROPBOX_REDIRECT_URI}&response_type=code&token_access_type=offline&state=${user.xata_id}`;
  return c.json({ redirectUri });
});

app.get("/oauth/callback", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/dropbox/oauth/callback" });
  const params = new URLSearchParams(c.req.url.split("?")[1]);
  const entries = Object.fromEntries(params.entries());
  // entries.code
  const response = await axios.postForm(
    "https://api.dropboxapi.com/oauth2/token",
    {
      code: entries.code,
      grant_type: "authorization_code",
      client_id: env.DROPBOX_CLIENT_ID,
      client_secret: env.DROPBOX_CLIENT_SECRET,
      redirect_uri: env.DROPBOX_REDIRECT_URI,
    }
  );

  const dropbox = await ctx.client.db.dropbox
    .select(["*", "user_id.*", "dropbox_token_id.*"])
    .filter("user_id.xata_id", equals(entries.state))
    .getFirst();

  const newDropboxToken = await ctx.client.db.dropbox_tokens.createOrUpdate(
    dropbox?.dropbox_token_id?.xata_id,
    {
      refresh_token: encrypt(
        response.data.refresh_token,
        env.SPOTIFY_ENCRYPTION_KEY
      ),
    }
  );

  await ctx.client.db.dropbox.createOrUpdate(dropbox?.xata_id, {
    dropbox_token_id: newDropboxToken.xata_id,
    user_id: entries.state,
  });

  return c.redirect(`${env.FRONTEND_URL}/dropbox`);
});

app.post("/join", async (c) => {
  requestCounter.add(1, { method: "POST", route: "/dropbox/join" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const body = await c.req.json();
  const parsed = emailSchema.safeParse(body);

  if (parsed.error) {
    c.status(400);
    return c.text("Invalid email: " + parsed.error.message);
  }

  const { email } = parsed.data;

  try {
    await ctx.client.db.dropbox_accounts.create({
      user_id: user.xata_id,
      email,
      is_beta_user: false,
    });
  } catch (e) {
    if (
      !e.message.includes("invalid record: column [user_id]: is not unique")
    ) {
      console.error(e.message);
    } else {
      throw e;
    }
  }

  await fetch("https://beta.rocksky.app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ROCKSKY_BETA_TOKEN}`,
    },
    body: JSON.stringify({ email }),
  });

  return c.json({ status: "ok" });
});

app.get("/files", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/dropbox/files" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const path = c.req.query("path");

  if (!path) {
    try {
      const { data } = await ctx.dropbox.post("dropbox.getFiles", {
        did,
      });

      return c.json(data);
    } catch {
      await ctx.dropbox.post("dropbox.createMusicFolder", {
        did,
      });
      const response = await ctx.dropbox.post("dropbox.getFiles", {
        did,
      });
      return c.json(response.data);
    }
  }

  const { data } = await ctx.dropbox.post("dropbox.getFilesAt", {
    did,
    path,
  });

  return c.json(data);
});

app.get("/temporary-link", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/dropbox/temporary-link" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const path = c.req.query("path");
  if (!path) {
    c.status(400);
    return c.text("Bad Request, path is required");
  }

  const { data } = await ctx.dropbox.post("dropbox.getTemporaryLink", {
    did,
    path,
  });

  return c.json(data);
});

app.get("/files/:id", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/dropbox/files/:id" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const path = c.req.param("id");

  const response = await ctx.dropbox.post("dropbox.getMetadata", {
    did,
    path,
  });

  return c.json(response.data);
});

app.get("/file", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/dropbox/file" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const path = c.req.query("path");

  if (!path) {
    c.status(400);
    return c.text("Bad Request, path is required");
  }

  const response = await ctx.dropbox.post("dropbox.getMetadata", {
    did,
    path,
  });

  return c.json(response.data);
});

app.get("/download", async (c) => {
  requestCounter.add(1, { method: "GET", route: "/dropbox/download" });
  const bearer = (c.req.header("authorization") || "").split(" ")[1]?.trim();

  if (!bearer || bearer === "null") {
    c.status(401);
    return c.text("Unauthorized");
  }

  const { did } = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  });

  const user = await ctx.client.db.users.filter("did", equals(did)).getFirst();
  if (!user) {
    c.status(401);
    return c.text("Unauthorized");
  }

  const path = c.req.query("path");
  if (!path) {
    c.status(400);
    return c.text("Bad Request, path is required");
  }

  const response = await ctx.dropbox.post("dropbox.downloadFile", {
    did,
    path,
  });

  c.header(
    "Content-Type",
    response.headers["content-type"] || "application/octet-stream"
  );
  c.header(
    "Content-Disposition",
    response.headers["content-disposition"] || "attachment"
  );

  return new Response(response.data, {
    headers: c.res.headers,
  });
});

export default app;
