import axios from "axios";
import chalk from "chalk";
import cors from "cors";
import express, { Request, Response } from "express";
import fs from "fs/promises";
import open from "open";
import os from "os";
import path from "path";

export async function login(handle: string): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = app.listen(6996);

  app.post("/token", async (req: Request, res: Response) => {
    console.log(chalk.bold(chalk.greenBright("Login successful!\n")));
    console.log(
      "You can use this session key (Token) to authenticate with the API."
    );
    console.log("Received token (session key):", chalk.green(req.body.token));

    const tokenPath = path.join(os.homedir(), ".rocksky", "token.json");
    await fs.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.writeFile(
      tokenPath,
      JSON.stringify({ token: req.body.token }, null, 2)
    );

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
  console.log(chalk.cyan(redirectUrl));

  open(redirectUrl);
}
