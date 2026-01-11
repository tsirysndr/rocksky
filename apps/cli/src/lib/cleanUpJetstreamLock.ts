import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "logger";

export function cleanUpJetstreamLockOnExit(did: string) {
  process.on("exit", async () => {
    try {
      await fs.promises.unlink(
        path.join(os.tmpdir(), `rocksky-jetstream-${did}.lock`),
      );
      process.exit(0);
    } catch (error) {
      logger.error`Error cleaning up Jetstream lock: ${error}`;
      process.exit(1);
    }
  });

  process.on("SIGINT", async () => {
    try {
      await fs.promises.unlink(
        path.join(os.tmpdir(), `rocksky-jetstream-${did}.lock`),
      );
      process.exit(0);
    } catch (error) {
      logger.error`Error cleaning up Jetstream lock: ${error}`;
      process.exit(1);
    }
  });

  process.on("SIGTERM", async () => {
    try {
      await fs.promises.unlink(
        path.join(os.tmpdir(), `rocksky-jetstream-${did}.lock`),
      );
      process.exit(0);
    } catch (error) {
      logger.error`Error cleaning up Jetstream lock: ${error}`;
      process.exit(1);
    }
  });

  process.on("uncaughtException", async () => {
    try {
      await fs.promises.unlink(
        path.join(os.tmpdir(), `rocksky-jetstream-${did}.lock`),
      );
      process.exit(1);
    } catch (error) {
      logger.error`Error cleaning up Jetstream lock: ${error}`;
      process.exit(1);
    }
  });

  process.on("unhandledRejection", async () => {
    try {
      await fs.promises.unlink(
        path.join(os.tmpdir(), `rocksky-jetstream-${did}.lock`),
      );
      process.exit(1);
    } catch (error) {
      logger.error`Error cleaning up Jetstream lock: ${error}`;
      process.exit(1);
    }
  });
}
