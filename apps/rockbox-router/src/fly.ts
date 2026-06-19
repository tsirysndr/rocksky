import { config } from "./config";
import { logger } from "./logger";

// https://fly.io/docs/machines/api/machines-resource/

type MachineState =
  | "created"
  | "starting"
  | "started"
  | "stopping"
  | "stopped"
  | "replacing"
  | "destroying"
  | "destroyed";

interface Machine {
  id: string;
  name: string;
  state: MachineState;
  region: string;
  private_ip: string;
}

const fly = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const res = await fetch(`${config.flyApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.flyApiToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error("fly api error", { path, status: res.status, body });
    throw new Error(`fly api ${path} → ${res.status}: ${body}`);
  }
  return res;
};

export async function getMachine(machineId: string): Promise<Machine | null> {
  const res = await fetch(
    `${config.flyApiBase}/apps/${config.flyApp}/machines/${machineId}`,
    { headers: { Authorization: `Bearer ${config.flyApiToken}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fly get machine ${machineId} → ${res.status}`);
  return (await res.json()) as Machine;
}

export async function createMachineForDid(did: string, region: string): Promise<Machine> {
  // Fly machine names: lowercased alnum + dashes, max 30 chars.
  const safeDid = did.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(-24);
  const name = `rockbox-${safeDid}`;

  const body = {
    name,
    region,
    config: {
      image: config.rockboxImage,
      env: { ROCKBOX_DID: did },
      guest: {
        cpu_kind: config.machineCpuKind,
        cpus: config.machineCpus,
        memory_mb: config.machineMemoryMb,
      },
      services: [
        {
          protocol: "tcp",
          internal_port: config.machineInternalPort,
          autostop: "stop",
          autostart: true,
          ports: [
            { port: 80, handlers: ["http"], force_https: true },
            { port: 443, handlers: ["tls", "http"] },
          ],
        },
      ],
      // restart on crash so the audio pipeline self-heals
      restart: { policy: "always" },
      checks: {
        // /healthz inside the Go proxy TCP-probes both 6062 (GraphQL) and 6063
        // (REST). If either is down the check returns 503 and Fly stops
        // replaying traffic to this machine — without that gate, requests land
        // mid-startup and fail with "error sending request for url
        // (http://127.0.0.1:6063/...)" from the GraphQL→REST internal hop.
        ready: {
          type: "http",
          port: config.machineInternalPort,
          method: "GET",
          path: "/healthz",
          interval: "10s",
          timeout: "2s",
          grace_period: "30s",
        },
      },
    },
  };

  logger.debug("POST fly machines", { name, region, image: config.rockboxImage });
  const res = await fly(`/apps/${config.flyApp}/machines`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return (await res.json()) as Machine;
}

// Block until the machine is in `started` state (or fail fast).
export async function waitForStart(machineId: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // The wait endpoint blocks server-side until state matches.
  const url = `/apps/${config.flyApp}/machines/${machineId}/wait?state=started&timeout=${Math.ceil(
    timeoutMs / 1000,
  )}`;
  await fly(url);
  if (Date.now() > deadline) {
    throw new Error(`machine ${machineId} did not reach started state in time`);
  }
}

export async function startMachine(machineId: string): Promise<void> {
  logger.debug("start machine", { machineId });
  await fly(`/apps/${config.flyApp}/machines/${machineId}/start`, { method: "POST" });
}

export async function destroyMachine(machineId: string): Promise<void> {
  logger.info("destroy machine", { machineId });
  await fly(
    `/apps/${config.flyApp}/machines/${machineId}?force=true`,
    { method: "DELETE" },
  );
}
