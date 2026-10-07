import { PermissionsAndroid, Platform } from "react-native";
import { localMusicNative } from "../../modules/rocksky-engine";

export * from "./deviceMusicModel";
import type { DeviceLibrary } from "./deviceMusicModel";

export async function scanDeviceMusic() {
  if (Platform.OS !== "android")
    throw new Error("Device music scanning is available on Android.");
  const permission =
    Number(Platform.Version) >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
  const granted = await PermissionsAndroid.request(permission);
  if (granted !== PermissionsAndroid.RESULTS.GRANTED)
    throw new Error(
      "Allow music access in Android settings to scan your library.",
    );
  await localMusicNative.scan();
}

export async function readDeviceLibrary(): Promise<DeviceLibrary> {
  return localMusicNative.library();
}
