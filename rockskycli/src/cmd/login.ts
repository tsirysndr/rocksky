import axios from "axios";
import cors from "cors";
import express, { Request, Response } from "express";
import open from "open";

export async function login(handle: string): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = app.listen(6996);

  app.post("/token", (req: Request, res: Response) => {
    console.log("Login successful!");
    console.log(
      "You can use this session key (Token) to authenticate with the API."
    );
    console.log("Received token (session key):", req.body.token);
    res.json({
      ok: 1,
    });

    server.close();
  });

  const response = await axios.post("https://api.rocksky.app/login", {
    handle,
    cli: true,
  });

  const redirectUrl = response.data;

  if (!redirectUrl.includes("authorize")) {
    console.error("Failed to login, please check your handle and try again.");
    server.close();
    return;
  }

  console.log("Please visit this URL to authorize the app:");
  console.log(redirectUrl);

  open(redirectUrl);
}
