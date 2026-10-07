import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import type pg from "pg";
import {
  handlePgConnectionErrors,
  isPgConnectionError,
  retryPgConnection,
} from "./pgConnectionRecovery";

describe("Postgres connection recovery", () => {
  it("handles checked-out client errors and idle pool errors", () => {
    const pool = new EventEmitter();
    const client = new EventEmitter();
    const report = mock(() => {});
    handlePgConnectionErrors(pool as pg.Pool, "primary", report);
    pool.emit("connect", client);
    expect(() =>
      client.emit("error", new Error("Connection terminated unexpectedly")),
    ).not.toThrow();
    expect(() =>
      pool.emit("error", new Error("Connection terminated unexpectedly")),
    ).not.toThrow();
    expect(report).toHaveBeenCalledTimes(2);
  });
  it("recognizes wrapped disconnects but not SQL errors", () => {
    expect(
      isPgConnectionError(
        new Error("Failed query", {
          cause: new Error("Connection terminated unexpectedly"),
        }),
      ),
    ).toBe(true);
    expect(isPgConnectionError({ cause: { code: "57P01" } })).toBe(true);
    expect(
      isPgConnectionError(
        new Error(
          "Client has encountered a connection error and is not queryable",
        ),
      ),
    ).toBe(true);
    expect(
      isPgConnectionError({ code: "23505", message: "duplicate key" }),
    ).toBe(false);
    expect(
      isPgConnectionError({ code: "42601", message: "syntax error" }),
    ).toBe(false);
  });
  it("retries the same operation with backoff until it succeeds", async () => {
    const sleep = mock(async (_ms: number) => {});
    let calls = 0;
    const run = mock(async () => {
      if (++calls < 3)
        throw Object.assign(new Error("socket closed"), { code: "ECONNRESET" });
      return { album: "same-album", status: "matched" };
    });
    expect(await retryPgConnection(run, { sleep })).toEqual({
      album: "same-album",
      status: "matched",
    });
    expect(sleep.mock.calls).toEqual([[1000], [2000]]);
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("stops after bounded retries without recording a miss", async () => {
    const error = new Error("Connection terminated unexpectedly");
    const run = mock(async () => {
      throw error;
    });
    const sleep = mock(async () => {});
    await expect(retryPgConnection(run, { attempts: 3, sleep })).rejects.toBe(
      error,
    );
    expect(run).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("does not replay non-connection errors", async () => {
    const error = Object.assign(new Error("permission denied"), {
      code: "42501",
    });
    const run = mock(async () => {
      throw error;
    });
    const sleep = mock(async () => {});
    await expect(retryPgConnection(run, { sleep })).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
