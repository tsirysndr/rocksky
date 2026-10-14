import { expect, it } from "bun:test";
import { findDurableRecord, publishDurableRecord } from "./durableRecord";

it("reconciles a remote success whose reply was lost", async () => {
  let persisted = false;
  const uri = "at://did:plc:a/app.rocksky.scrobble/3mv234567abcd";
  const result = await publishDurableRecord(
    async () => {
      persisted = true;
      throw new Error("connection reset after commit");
    },
    async () => {
      expect(persisted).toBe(true);
      return { data: { uri } };
    },
  );
  expect(result).toBe(uri);
});

it("does not mistake a PDS outage for a missing record", async () => {
  let error: unknown;
  try {
    await findDurableRecord(async () => {
      throw new Error("timeout");
    });
  } catch (caught) {
    error = caught;
  }
  expect((error as Error).message).toBe("timeout");
  expect(
    await findDurableRecord(async () => {
      throw { error: "RecordNotFound" };
    }),
  ).toBe(undefined);
});

it("does not acknowledge a failed write when the record is absent", async () => {
  let failed = false;
  try {
    await publishDurableRecord(
      async () => {
        throw new Error("write failed");
      },
      async () => {
        throw { error: "RecordNotFound" };
      },
    );
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
});
