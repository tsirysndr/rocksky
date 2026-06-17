import { Container, getContainer, getRandom } from "@cloudflare/containers";
import { Hono } from "hono";
import { cors } from "hono/cors";

export class RockboxContainer extends Container<Env> {
	// Port the container listens on (default: 8080)
	defaultPort = 8080;
	// Time before container sleeps due to inactivity (default: 30s)
	sleepAfter = "2m";
	// Environment variables passed to the container
	envVars = {
		MESSAGE: "I was passed in via the container class!",
	};

	// Optional lifecycle hooks
	override onStart() {
		console.log("Container successfully started");
	}

	override onStop() {
		console.log("Container successfully shut down");
	}

	override onError(error: unknown) {
		console.log("Container error:", error);
	}
}

// Create Hono app with proper typing for Cloudflare Workers
const app = new Hono<{
	Bindings: Env;
}>();

app.use("*", cors());

// Home route with available endpoints
app.get("/", (c) => {
	return c.text(
		"Available endpoints:\n" +
			"GET /<ID> - Start a container for each ID with a 2m timeout\n"
	);
});

app.all("/assets/*", async (c) => {
	const container = getContainer(c.env.ROCKBOX_CONTAINER, 'assets');
	return await container.fetch(c.req.raw);
});

app.all("/graphql", async (c) => {
	const container = getContainer(c.env.ROCKBOX_CONTAINER, 'did:plc:7vdlgi2bflelz7mmuxoqjfcr');
	return await container.fetch(c.req.raw);
});

// Route requests to a specific container, stripping the /:id prefix
app.all("/:id/*", async (c) => {
	const id = c.req.param("id");
	const url = new URL(c.req.url);
	url.pathname = url.pathname.slice(1 + id.length) || "/";
	const headers = new Headers(c.req.raw.headers);
	headers.set("X-Rockbox-Id", id);
	const container = getContainer(c.env.ROCKBOX_CONTAINER, id);
	return await container.fetch(new Request(url.toString(), {
		method: c.req.method,
		headers,
		body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
	}));
});

app.all("/:id", async (c) => {
	const id = c.req.param("id");
	const url = new URL(c.req.url);
	url.pathname = "/";
	const container = getContainer(c.env.ROCKBOX_CONTAINER, id);
	return await container.fetch(new Request(url.toString(), c.req.raw));
});

export default app;
