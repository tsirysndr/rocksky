import dns from "node:dns";
import { consola } from "consola";

export const setDnsIpv4First = () => {
  dns.setDefaultResultOrder("ipv4first");
};

export const installCrashHandlers = () => {
  process.on("unhandledRejection", (err) => {
    consola.error("Unhandled rejection:", err);
  });
  process.on("uncaughtException", (err) => {
    consola.error("Uncaught exception:", err);
  });
};
