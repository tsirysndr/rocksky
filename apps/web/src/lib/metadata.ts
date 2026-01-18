import consola from "consola";
import init, { extract_audio_metadata } from "../pkg/raichu";

export class Metadata {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private metadata: any;

  async load(url: string) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await init(); // Initialize WASM
    this.metadata = extract_audio_metadata(uint8Array);
    consola.log(">> Metadata Loaded Successfully");
  }

  get_metadata() {
    return this.metadata ? JSON.parse(this.metadata) : {};
  }
}

export default Metadata;
