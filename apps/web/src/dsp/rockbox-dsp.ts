/**
 * rockbox-dsp.ts
 *
 * Main-thread TypeScript wrapper for the Rockbox DSP AudioWorklet.
 * Provides a typed API over the message channel to rockbox-dsp-processor.ts.
 *
 * Usage:
 *   const dsp = await RockboxDSP.create(audioCtx);
 *
 *   // Insert in the audio graph
 *   sourceNode.connect(dsp.node);
 *   dsp.node.connect(audioCtx.destination);
 *
 *   // 10-band EQ (band 0 = low-shelf, 1-8 = peaking, 9 = high-shelf)
 *   dsp.enableEQ(true);
 *   dsp.setEqBand(0, { cutoff: 60,   q: 0.7, gain:  6 }); // low shelf +6 dB
 *   dsp.setEqBand(5, { cutoff: 1000, q: 1.0, gain: -3 }); // 1 kHz -3 dB
 *   dsp.setEqBand(9, { cutoff: 8000, q: 0.7, gain:  4 }); // high shelf +4 dB
 *
 *   // Haas surround
 *   dsp.enableSurround(true);
 *   dsp.setSurroundDelay(15);
 *   dsp.setSurroundMix(80);
 */

export interface EqBandOptions {
  cutoff: number; // Hz — centre / shelf frequency
  q?: number;     // Q factor (default 0.7)
  gain: number;   // dB — positive = boost, negative = cut
}

export interface SurroundOptions {
  delayMs?: number;   // 5–30 ms  (default 15)
  mix?: number;       // 0–100 %  (default 100)
  balance?: number;   // -100…+100 (default 0)
  sideOnly?: boolean; // process side signal only (default false)
  cutoffL?: number;   // bass/voice crossover Hz  (default 320)
  cutoffH?: number;   // voice/treble crossover Hz (default 3400)
}

export class RockboxDSP {
  readonly node: AudioWorkletNode;

  private constructor(node: AudioWorkletNode) {
    this.node = node;
  }

  /**
   * Load the processor module and create the DSP node.
   * @param ctx  AudioContext to attach the node to.
   * @param processorUrl  URL of the compiled rockbox-dsp-processor.js file.
   */
  static async create(
    ctx: AudioContext,
    processorUrl = './rockbox-dsp-processor.js',
  ): Promise<RockboxDSP> {
    await ctx.audioWorklet.addModule(processorUrl);
    const node = new AudioWorkletNode(ctx, 'rockbox-dsp', {
      numberOfInputs:    1,
      numberOfOutputs:   1,
      outputChannelCount:[2],
    });
    return new RockboxDSP(node);
  }

  private send(msg: object): void {
    this.node.port.postMessage(msg);
  }

  // ── EQ ────────────────────────────────────────────────────────────────────

  /** Turn the 10-band EQ on or off. */
  enableEQ(on = true): this {
    this.send({ type: 'eq.enable', value: on });
    return this;
  }

  /**
   * Configure one EQ band.
   * @param band  0 = low-shelf · 1-8 = peaking · 9 = high-shelf
   */
  setEqBand(band: number, { cutoff, q = 0.7, gain }: EqBandOptions): this {
    this.send({ type: 'eq.band', band, cutoff, q, gain });
    return this;
  }

  /**
   * Apply all 10 bands at once.
   * Missing bands are left at their current setting.
   */
  setEqBands(bands: Partial<Record<number, EqBandOptions>>): this {
    for (const [key, opts] of Object.entries(bands)) {
      if (opts) this.setEqBand(Number(key), opts);
    }
    return this;
  }

  /**
   * Pre-EQ gain reduction to prevent clipping on heavy boosts.
   * @param precutDb  Positive value = reduce gain (e.g. 6 → −6 dB headroom).
   */
  setEqPrecut(precutDb: number): this {
    this.send({ type: 'eq.precut', value: precutDb });
    return this;
  }

  /** Clear EQ filter histories (useful after a seek or source change). */
  flushEQ(): this {
    this.send({ type: 'eq.flush' });
    return this;
  }

  // ── Surround ──────────────────────────────────────────────────────────────

  /** Turn the Haas surround effect on or off. */
  enableSurround(on = true): this {
    this.send({ type: 'surround.enable', value: on });
    return this;
  }

  /**
   * Delay length of the surround effect.
   * @param ms  5–30 ms (clamped). Longer = wider perceived stage.
   */
  setSurroundDelay(ms: number): this {
    this.send({ type: 'surround.delay', value: ms });
    return this;
  }

  /**
   * Wet/dry mix of the surround effect.
   * @param pct  0 (fully dry) … 100 (fully wet).
   */
  setSurroundMix(pct: number): this {
    this.send({ type: 'surround.mix', value: pct });
    return this;
  }

  /**
   * Left/right balance within the surround output.
   * @param b  -100 (push left) … 0 (centre) … +100 (push right).
   */
  setSurroundBalance(b: number): this {
    this.send({ type: 'surround.balance', value: b });
    return this;
  }

  /**
   * When true, the Haas effect is applied only to the stereo side signal;
   * the mono centre content passes through unmodified.
   */
  setSurroundSideOnly(v: boolean): this {
    this.send({ type: 'surround.sideOnly', value: v });
    return this;
  }

  /**
   * Crossover frequencies used to route different bands to different delays.
   * @param low   Bass/voice crossover in Hz (default 320).
   * @param high  Voice/treble crossover in Hz (default 3400).
   */
  setSurroundCutoffs(low: number, high: number): this {
    this.send({ type: 'surround.cutoffs', low, high });
    return this;
  }

  /**
   * Apply multiple surround settings at once.
   */
  configureSurround(opts: SurroundOptions): this {
    if (opts.delayMs   !== undefined) this.setSurroundDelay(opts.delayMs);
    if (opts.mix       !== undefined) this.setSurroundMix(opts.mix);
    if (opts.balance   !== undefined) this.setSurroundBalance(opts.balance);
    if (opts.sideOnly  !== undefined) this.setSurroundSideOnly(opts.sideOnly);
    if (opts.cutoffL !== undefined || opts.cutoffH !== undefined)
      this.setSurroundCutoffs(opts.cutoffL ?? 320, opts.cutoffH ?? 3400);
    return this;
  }

  /** Clear surround delay-line histories (useful after a seek or source change). */
  flushSurround(): this {
    this.send({ type: 'surround.flush' });
    return this;
  }

  /** Flush both EQ and surround histories. */
  flush(): this {
    return this.flushEQ().flushSurround();
  }

  /** Connect a source node → DSP → destination in one call. */
  connect(source: AudioNode, destination: AudioNode): this {
    source.connect(this.node);
    this.node.connect(destination);
    return this;
  }

  /** Disconnect and clean up. */
  disconnect(): void {
    this.node.disconnect();
  }
}
