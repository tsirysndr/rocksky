const must = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env var: ${k}`);
  return v;
};

export const config = {
  port: Number(process.env.PORT ?? 8080),

  // Fly app that hosts the per-DID rockbox machines.
  flyApp: must("FLY_APP"),
  flyApiToken: must("FLY_API_TOKEN"),
  flyApiBase: process.env.FLY_API_BASE ?? "https://api.machines.dev/v1",

  // Image + machine sizing.
  // Default points at the image built/pushed by apps/rockbox-image. It includes
  // the Go proxy that fronts rockbox on :8080 (Fly machines expose one port).
  // Plain `tsiry/rockbox:latest` will NOT work here — Fly's edge will get
  // `PC01: instance refused connection` because rockbox itself doesn't bind 8080.
  rockboxImage: process.env.ROCKBOX_IMAGE ?? "registry.fly.io/rockbox:latest",
  defaultRegion: process.env.FLY_DEFAULT_REGION ?? "iad",
  // performance-2x: 2 dedicated vCPUs. The pipeline has genuine concurrency
  // — decoder thread, encoder thread, buffering thread, pcm-cmaf sink — and
  // on a single core the sink can poll for PCM before the decoder gets a
  // chance to run, tripping "no more PCM data" within the first 23 ms.
  // 2 vCPUs lets decoder and encoder run truly in parallel; 3+ adds no
  // further benefit for one user's stream.
  machineCpuKind: (process.env.MACHINE_CPU_KIND ?? "shared") as "shared" | "performance",
  machineCpus: Number(process.env.MACHINE_CPUS ?? 4),
  machineMemoryMb: Number(process.env.MACHINE_MEMORY_MB ?? 1024),
  machineInternalPort: Number(process.env.MACHINE_INTERNAL_PORT ?? 8080),

  // Postgres for the did → machine_id mapping (reuses the API DB by default).
  postgresUrl: must("ROUTER_POSTGRES_URL"),

  // Optional: shared bearer the CF Worker presents before we'll route anything.
  // Skip auth in dev by leaving this unset.
  authBearer: process.env.ROUTER_AUTH_BEARER ?? null,
};
