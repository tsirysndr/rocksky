// Submission callbacks only, on a loopback port, so durable publication does
// not queue behind public traffic on the REST service. No public routes and
// no NATS subscribers: those stay with the REST service.
import "./otel";
import dns from "node:dns";
import { serve } from "@hono/node-server";
import { consola } from "consola";
import { Hono } from "hono";
import submissionsApp from "./submissions/app";

dns.setDefaultResultOrder("ipv4first");

const port = Number(process.env.SUBMISSIONS_CALLBACK_PORT) || 8099;

const app = new Hono();
app.route("/internal/submissions", submissionsApp);

serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
consola.info(`Submission callbacks listening on 127.0.0.1:${port}`);
