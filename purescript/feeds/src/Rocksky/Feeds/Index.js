export const version = () => process.env.COMMIT_SHA ?? 'unknown';
export const logPoolError = error => () => console.error('Idle pg client error:', error.message);
export const installShutdown = server => pool => () => {
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    server.close(async () => {
      try { await pool.end(); await globalThis.rockskyFeedsTelemetry?.shutdown(); }
      catch (error) { console.error(error); process.exitCode = 1; }
    });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
};
