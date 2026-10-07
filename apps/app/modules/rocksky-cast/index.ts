import { requireOptionalNativeModule } from "expo";
const native = requireOptionalNativeModule<{
  shareFile(path: string): Promise<{ url: string; contentType: string }>;
  stopServer(): Promise<void>;
}>("RockskyCast");
export const castFiles = {
  async share(path: string) {
    if (!native)
      throw new Error("Casting local files requires an Android native build.");
    return native.shareFile(
      path.startsWith("file://") ? decodeURIComponent(path.slice(7)) : path,
    );
  },
  async stop() {
    await native?.stopServer();
  },
};
