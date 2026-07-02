import postgres from "postgres";
import { config } from "./config";
import { logger } from "./logger";

export const sql = postgres(config.postgresUrl, { max: 4, prepare: false });

logger.info("ensuring rockbox_machines table");
await sql`
  CREATE TABLE IF NOT EXISTS rockbox_machines (
    did            TEXT PRIMARY KEY,
    machine_id     TEXT NOT NULL,
    region         TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
logger.success("rockbox_machines table ready");

export type MachineRow = {
  did: string;
  machine_id: string;
  region: string;
};

export async function lookupMachine(did: string): Promise<MachineRow | null> {
  const rows = await sql<MachineRow[]>`
    SELECT did, machine_id, region FROM rockbox_machines WHERE did = ${did}
  `;
  return rows[0] ?? null;
}

export async function saveMachine(did: string, machineId: string, region: string): Promise<void> {
  await sql`
    INSERT INTO rockbox_machines (did, machine_id, region)
    VALUES (${did}, ${machineId}, ${region})
    ON CONFLICT (did) DO UPDATE
      SET machine_id = EXCLUDED.machine_id,
          region     = EXCLUDED.region,
          last_used_at = NOW()
  `;
}

export async function touchMachine(did: string): Promise<void> {
  await sql`UPDATE rockbox_machines SET last_used_at = NOW() WHERE did = ${did}`;
}

export async function forgetMachine(did: string): Promise<void> {
  await sql`DELETE FROM rockbox_machines WHERE did = ${did}`;
}

export async function userExistsByDid(did: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM users WHERE did = ${did}) AS exists
  `;
  return rows[0]?.exists === true;
}
