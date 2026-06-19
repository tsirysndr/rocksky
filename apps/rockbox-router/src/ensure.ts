import { config } from "./config";
import { forgetMachine, lookupMachine, saveMachine, touchMachine } from "./db";
import { createMachineForDid, getMachine, startMachine, waitForStart } from "./fly";
import { logger } from "./logger";

// Coalesce concurrent first-play requests for the same DID.
const inflight = new Map<string, Promise<string>>();

async function provision(did: string, region: string): Promise<string> {
  logger.info("provisioning new machine", { did, region });
  const t0 = performance.now();
  const m = await createMachineForDid(did, region);
  logger.info("machine created, saving + waiting for start", {
    did,
    machineId: m.id,
    region: m.region,
  });
  await saveMachine(did, m.id, m.region);
  await waitForStart(m.id);
  logger.success("machine ready", {
    did,
    machineId: m.id,
    region: m.region,
    ms: Math.round(performance.now() - t0),
  });
  return m.id;
}

async function resolve(did: string, region: string): Promise<string> {
  const existing = await lookupMachine(did);
  if (existing) {
    const remote = await getMachine(existing.machine_id);
    if (!remote || remote.state === "destroyed" || remote.state === "destroying") {
      // Stale row; the machine was destroyed out-of-band. Re-provision.
      logger.warn("stale machine row, re-provisioning", {
        did,
        machineId: existing.machine_id,
        state: remote?.state ?? "missing",
      });
      await forgetMachine(did);
      return provision(did, region);
    }
    // Fly's proxy will autostart on traffic, but nudge it if we know it's stopped
    // so the first segment doesn't time out.
    if (remote.state === "stopped") {
      logger.info("nudging stopped machine", { did, machineId: remote.id });
      await startMachine(remote.id).catch((e) => {
        logger.warn("startMachine nudge failed (continuing)", {
          machineId: remote.id,
          err: String(e),
        });
      });
    }
    await touchMachine(did);
    logger.debug("resolved existing machine", {
      did,
      machineId: remote.id,
      state: remote.state,
    });
    return remote.id;
  }
  return provision(did, region);
}

export function ensureMachine(did: string, region?: string): Promise<string> {
  const cached = inflight.get(did);
  if (cached) {
    logger.debug("joining inflight ensureMachine", { did });
    return cached;
  }
  const p = resolve(did, region ?? config.defaultRegion).finally(() => inflight.delete(did));
  inflight.set(did, p);
  return p;
}
