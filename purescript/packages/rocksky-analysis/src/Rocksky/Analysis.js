import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const orNull = (v) => (v === undefined ? null : v);

export const loadImpl = () =>
  import("@rocksky/analysis").then(
    (m) => m,
    () => null,
  );

const analysis = (a) =>
  a === null || a === undefined
    ? null
    : {
        bpm: orNull(a.bpm),
        bpmConfidence: orNull(a.bpmConfidence),
        key: orNull(a.key),
        keyConfidence: orNull(a.keyConfidence),
        ...(Object.hasOwn(a, "fingerprint") ? { fingerprint: a.fingerprint } : {}),
        duration: a.duration,
      };

export const analyzeImpl = (m) => (buf) => (ext) => () => m.analyze(buf, ext).then(analysis);

export const analyzeFileImpl = (m) => (path) => async () => {
  const buf = await readFile(path);
  const ext = extname(path).replace(/^\./, "");
  return analysis(await m.analyze(buf, ext === "" ? null : ext));
};

export const supportsFingerprint = (a) => a !== null && typeof a === "object" && "fingerprint" in a;

export const analyzeBatchImpl = (m) => (items) => (onProgress) => () =>
  m
    .analyzeBatch(
      items.map((i) => dropNulls({ id: i.id, buffer: i.buffer, extensionHint: i.extensionHint })),
      (p) =>
        onProgress({
          id: orNull(p.id),
          index: p.index,
          completed: p.completed,
          total: p.total,
          ok: p.ok,
          bpm: orNull(p.bpm),
          key: orNull(p.key),
          fingerprint: Boolean(p.fingerprint),
          error: orNull(p.error),
        }),
    )
    .then((rs) =>
      rs.map((r) => ({
        id: orNull(r.id),
        ok: r.ok,
        analysis: analysis(r.analysis),
        error: orNull(r.error),
      })),
    );

export const loadCheckedImpl = () => import("@rocksky/analysis");
