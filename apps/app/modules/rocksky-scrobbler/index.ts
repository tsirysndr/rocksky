import { requireOptionalNativeModule } from "expo";

export type ScrobbleSettings = {
  enabled: boolean;
  mode: "listened" | "position";
  seconds: number;
  percent: number;
  minimum: number;
  recognize: boolean;
  blocked: string[];
};
export type ScrobbleStatus = ScrobbleSettings & {
  excluded?: string[];
  notificationAccess: boolean;
  connected: boolean;
  signedIn: boolean;
  queued: number;
  failed: number;
  lastUpload: number;
  error: string | null;
  current: string | null;
  apps: { packageName: string; label: string }[];
};
export const scrobbler = requireOptionalNativeModule<{
  setAuth(
    token: string | null,
    did: string | null,
    endpoint: string,
  ): Promise<void>;
  configure(json: string): Promise<void>;
  status(): Promise<ScrobbleStatus>;
  openNotificationAccess(): Promise<void>;
  openBatterySettings(): Promise<void>;
  retry(): Promise<void>;
}>("RockskyScrobbler");
