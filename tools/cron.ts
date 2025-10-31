#!/usr/bin/env -S deno run --unstable-cron -A

/// <reference lib="deno.ns" />
/// <reference lib="dom" />

import chalk from "chalk";

const args = Deno.args;

if (args.length < 2) {
  console.log(
    chalk.greenBright("Usage: cron <interval-in-minutes> <command> [args...]")
  );
  Deno.exit(0);
}

const interval = parseInt(args[0], 10);
if (Number.isNaN(interval) || interval <= 0) {
  console.error("Interval must be a positive integer");
  Deno.exit(1);
}

Deno.cron("cron", { minute: { every: interval } }, async () => {
  const command = new Deno.Command(args[1], {
    args: args.slice(2),
    stdout: "inherit",
    stderr: "inherit",
  });
  const child = command.spawn();
  const status = await child.status;
  if (!status.success) {
    console.error(`Cron job failed with code ${status.code}`);
  }
  console.log(`Cron job executed at ${new Date().toISOString()}`);
});
