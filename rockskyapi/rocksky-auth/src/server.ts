import { ctx } from "context";
import express from "express";
import { createServer } from "lexicon";
import API from "./xrpc";

let server = createServer({
  validateResponse: false,
  payload: {
    jsonLimit: 100 * 1024, // 100kb
    textLimit: 100 * 1024, // 100kb
    blobLimit: 5 * 1024 * 1024, // 5mb
  },
});

server = API(server, ctx);

const app = express();
app.use(server.xrpc.router);

app.listen(process.env.ROCKSKY_XPRC_PORT || 3004, () => {
  console.log(
    `Rocksky XRPC API is running on port ${process.env.ROCKSKY_XRPC_PORT || 3004}`
  );
});
