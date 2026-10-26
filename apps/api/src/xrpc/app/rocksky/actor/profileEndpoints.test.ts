import { AtpAgent } from "@atproto/api";
import { expect, it } from "bun:test";
import register from "./getProfile";
import { fetchBskyProfile } from "lib/bskyProfile";

function stubCall() {
  const original = AtpAgent.prototype.call;
  return {
    mockImplementation(fn: any) {
      AtpAgent.prototype.call = fn;
    },
    mockRestore() {
      AtpAgent.prototype.call = original;
    },
  };
}

it("loads profile and linked accounts once, deferring PDS resolution", async () => {
  const call = stubCall();
  const date = new Date("2025-01-01");
  const user = {
    id: "u",
    did: "did:plc:test",
    handle: "actor.test",
    avatar: "saved",
    displayName: "Saved",
    createdAt: date,
    updatedAt: date,
  };
  const selections: any[] = [],
    requests: string[] = [];
  let connected = true,
    lookups = 0,
    handler: any;
  const db = {
    select(projection: any) {
      selections.push(projection);
      const q = {
        from() {
          return q;
        },
        leftJoin() {
          return q;
        },
        where() {
          return q;
        },
        limit() {
          return q;
        },
        async execute() {
          return [
            {
              user: { ...user },
              spotify: connected
                ? {
                    id: "s",
                    email: "private@example.test",
                    createdAt: date,
                    updatedAt: date,
                  }
                : null,
              tokenId: connected ? "token" : null,
            },
          ];
        },
      };
      return q;
    },
  };
  const ctx = {
    db,
    baseIdResolver: {
      handle: {
        async resolve() {
          lookups++;
          return user.did;
        },
      },
      did: {
        async resolveAtprotoData() {
          throw new Error("PDS resolution must be lazy");
        },
      },
    },
    resolver: {
      async resolveDidToHandle() {
        return user.handle;
      },
    },
  };
  try {
    call.mockImplementation(async (input: any) => {
      requests.push(String(input));
      return { data: { did: user.did, handle: user.handle } } as any;
    });
    register(
      {
        app: {
          rocksky: {
            actor: {
              getProfile(config: any) {
                handler = config.handler;
              },
            },
          },
        },
      } as any,
      ctx as any,
    );
    const first = await handler({ params: { did: "actor.test" }, auth: {} });
    expect(lookups).toBe(1);
    expect(selections.length).toBe(1);
    expect(requests.length).toBe(1);
    expect(requests[0]).toContain("app.bsky.actor.getProfile");
    expect(Object.keys(selections[0])).toEqual(["user", "spotify", "tokenId"]);
    expect(first.body.displayName).toBe("Saved");
    expect(first.body.avatar).toBe("saved");
    expect(first.body.spotifyConnected).toBe(true);
    expect(Object.hasOwn(first.body.spotifyUser, "email")).toBe(false);
    connected = false;
    const second = await handler({ params: { did: user.did }, auth: {} });
    expect(second.body.spotifyConnected).toBe(false);
    expect(JSON.stringify(second.body.spotifyUser)).toBe("{}");
    expect(lookups).toBe(1);
  } finally {
    call.mockRestore();
  }
});

it("resolves the fallback agent only after AppView failure", async () => {
  const call = stubCall();
  let calls = 0;
  const fallback = async () => {
    calls++;
    return {
      com: {
        atproto: {
          repo: {
            getRecord: async () => ({
              data: { value: { displayName: "Fallback" } },
            }),
          },
        },
      },
    } as any;
  };
  try {
    call.mockImplementation(
      async () =>
        ({ data: { did: "did:plc:test", handle: "actor.test" } }) as any,
    );
    await fetchBskyProfile("did:plc:test", fallback);
    expect(calls).toBe(0);
    call.mockImplementation(async () => {
      throw new Error("AppView unavailable");
    });
    expect((await fetchBskyProfile("did:plc:test", fallback)).displayName).toBe(
      "Fallback",
    );
    expect(calls).toBe(1);
  } finally {
    call.mockRestore();
  }
});
