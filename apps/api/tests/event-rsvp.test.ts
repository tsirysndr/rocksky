import { describe, expect, mock, test } from "bun:test";
import type { Agent } from "@atproto/api";
import type { Context } from "context";
import { putRsvp } from "../src/xrpc/app/rocksky/event/putRsvp";

const did = "did:plc:viewer";
const event = {
  id: "event",
  uri: "at://did:plc:organizer/community.lexicon.calendar.event/3mtest",
  cid: "event-cid",
};
const going = "community.lexicon.calendar.rsvp#going";
const interested = "community.lexicon.calendar.rsvp#interested";
const input = { uri: event.uri, status: going };

function rows(value: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy", "limit"])
    query[method] = () => query;
  query.then = (resolve: (value: unknown[]) => unknown) =>
    Promise.resolve(value).then(resolve);
  return query;
}

function setup(
  options: {
    existing?: unknown;
    missingEvent?: boolean;
    missingUser?: boolean;
    failure?: unknown;
    missingCid?: boolean;
  } = {},
) {
  const putRecord = mock(async (params: { rkey: string }) => {
    if (options.failure) throw options.failure;
    return {
      data: {
        uri: `at://${did}/community.lexicon.calendar.rsvp/${params.rkey}`,
        cid: "rsvp-cid",
      },
    };
  });
  const getRecord = mock(async () => ({ data: { cid: "fetched-cid" } }));
  const values = mock((value: unknown) => ({
    onConflictDoUpdate: mock(async () => value),
  }));
  const tx = {
    execute: mock(async () => {}),
    select: () => rows(options.existing ? [options.existing] : []),
    insert: () => ({ values }),
  };
  let read = 0;
  const ctx = {
    db: {
      select: () =>
        rows(
          read++ === 0
            ? options.missingEvent
              ? []
              : [
                  {
                    events: {
                      ...event,
                      cid: options.missingCid ? null : event.cid,
                    },
                  },
                ]
            : options.missingUser
              ? []
              : [{ id: "viewer", did }],
        ),
      transaction: (fn: (tx: unknown) => unknown) => fn(tx),
    },
  } as unknown as Context;
  const agentFactory = mock(
    async () =>
      ({
        com: { atproto: { repo: { putRecord, getRecord } } },
      }) as unknown as Agent,
  );
  return { ctx, agentFactory, putRecord, getRecord, values, tx };
}

describe("putRsvp", () => {
  test("rejects anonymous requests and invalid statuses before touching the PDS", async () => {
    const s = setup();
    await expect(
      putRsvp(s.ctx, input, undefined, s.agentFactory),
    ).rejects.toThrow("Sign in");
    await expect(
      putRsvp(s.ctx, { ...input, status: "invalid" }, did, s.agentFactory),
    ).rejects.toThrow("Invalid RSVP status");
    expect(s.agentFactory).not.toHaveBeenCalled();
  });
  test("rejects unknown events and unknown viewers", async () => {
    for (const options of [{ missingEvent: true }, { missingUser: true }]) {
      const s = setup(options);
      await expect(
        putRsvp(s.ctx, input, did, s.agentFactory),
      ).rejects.toThrow();
      expect(s.putRecord).not.toHaveBeenCalled();
    }
  });
  test("writes a calendar RSVP to the viewer's PDS and immediately indexes it", async () => {
    const s = setup();
    const result = await putRsvp(s.ctx, input, did, s.agentFactory);
    expect(s.tx.execute).toHaveBeenCalledTimes(1);
    expect(s.putRecord.mock.calls[0][0]).toMatchObject({
      repo: did,
      collection: "community.lexicon.calendar.rsvp",
      record: { subject: { uri: event.uri, cid: "event-cid" }, status: going },
    });
    expect(s.values.mock.calls[0][0]).toMatchObject({
      eventId: event.id,
      userId: "viewer",
      uri: result.uri,
      cid: "rsvp-cid",
      status: going,
    });
    expect(result.status).toBe(going);
  });
  test("reuses existing records when changing or clearing an RSVP, including duplicate events", async () => {
    for (const status of [
      interested,
      "community.lexicon.calendar.rsvp#notgoing",
    ]) {
      const duplicate = {
        ...event,
        id: "duplicate",
        uri: event.uri + "-duplicate",
      };
      const s = setup({
        existing: {
          event: duplicate,
          rsvp: { uri: `at://${did}/community.lexicon.calendar.rsvp/existing` },
        },
      });
      await putRsvp(s.ctx, { ...input, status }, did, s.agentFactory);
      expect(s.putRecord.mock.calls[0][0]).toMatchObject({
        rkey: "existing",
        record: { subject: { uri: duplicate.uri }, status },
      });
      expect(s.values.mock.calls[0][0]).toMatchObject({
        eventId: "duplicate",
        status,
      });
    }
  });
  test("fetches the subject CID when the index has none", async () => {
    const s = setup({ missingCid: true });
    await putRsvp(s.ctx, input, did, s.agentFactory);
    expect(s.getRecord).toHaveBeenCalledTimes(1);
    expect(s.putRecord.mock.calls[0][0]).toMatchObject({
      record: { subject: { cid: "fetched-cid" } },
    });
  });
  test("asks for sign-in when the PDS denies permission and never indexes failed writes", async () => {
    for (const status of [401, 403, 500]) {
      const s = setup({
        failure: Object.assign(new Error("PDS failed"), { status }),
      });
      await expect(putRsvp(s.ctx, input, did, s.agentFactory)).rejects.toThrow(
        status === 500 ? "PDS failed" : "Sign in again",
      );
      expect(s.values).not.toHaveBeenCalled();
    }
  });
});
