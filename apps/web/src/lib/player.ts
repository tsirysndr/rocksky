import init, { AudioDecoder } from "../pkg/raichu";

class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;

  async load(url: string, ext: string) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await init(); // Initialize WASM
    const decoder = new AudioDecoder();
    decoder.decode(uint8Array, ext);

    const pcmData = decoder.get_pcm_data();
    const sampleRate = decoder.get_sample_rate();
    const channels = decoder.get_channels();

    this.audioContext = new window.AudioContext({ sampleRate });

    this.buffer = this.audioContext.createBuffer(
      channels,
      pcmData.length / channels,
      sampleRate
    );

    for (let i = 0; i < channels; i++) {
      const channelData = this.buffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        channelData[j] = pcmData[j * channels + i];
      }
    }

    console.log(">> Audio Loaded Successfully");
  }

  play(offset = 0) {
    if (this.audioContext && this.buffer) {
      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.buffer;
      this.sourceNode.connect(this.audioContext.destination);
      this.sourceNode.start(0, offset);
      this.sourceNode.loop = false;
    }
  }

  pause() {
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode = null;
    }
  }

  stop() {
    this.pause();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
export default AudioPlayer;
