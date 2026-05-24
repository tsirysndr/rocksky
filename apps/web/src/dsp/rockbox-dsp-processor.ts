/**
 * rockbox-dsp-processor.ts
 *
 * Pure-TypeScript port of Rockbox DSP (lib/rbcodec/dsp/):
 *   - 10-band parametric EQ  (eq.c / dsp_filter.c — Audio-EQ-Cookbook biquads)
 *   - Haas surround effect    (surround.c — frequency-dependent delay lines)
 *
 * This file runs inside an AudioWorkletGlobalScope. Compile it with tsc (or a
 * bundler), then load the output JS with:
 *
 *   await audioContext.audioWorklet.addModule('rockbox-dsp-processor.js');
 *   const node = new AudioWorkletNode(ctx, 'rockbox-dsp');
 *
 * Use RockboxDSP in rockbox-dsp.ts for a type-safe main-thread wrapper.
 *
 * License: GPL-2.0 (same as the original Rockbox firmware)
 */

// AudioWorklet globals not in the standard lib — declared here so tsc is happy.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}
declare function registerProcessor(
  name: string,
  ctor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BandConfig {
  cutoff: number; // Hz
  q: number;      // Q factor (e.g. 0.7)
  gain: number;   // dB — positive = boost, negative = cut
}

export interface SurroundConfig {
  delayMs?: number;   // 5–30 ms
  mix?: number;       // 0–100 %
  balance?: number;   // -100 … +100
  sideOnly?: boolean;
  cutoffL?: number;   // Hz — bass/voice crossover  (default 320)
  cutoffH?: number;   // Hz — voice/treble crossover (default 3400)
}

// Messages accepted by the processor from the main thread
export type DspMessage =
  | { type: 'eq.enable';       value: boolean }
  | { type: 'eq.band';         band: number; cutoff: number; q: number; gain: number }
  | { type: 'eq.precut';       value: number }
  | { type: 'eq.flush' }
  | { type: 'surround.enable'; value: boolean }
  | { type: 'surround.delay';  value: number }
  | { type: 'surround.mix';    value: number }
  | { type: 'surround.balance';value: number }
  | { type: 'surround.sideOnly';value: boolean }
  | { type: 'surround.cutoffs';low: number; high: number }
  | { type: 'surround.flush' };

// ─────────────────────────────────────────────────────────────────────────────
// BiquadFilter
// Port of dsp_filter.c: filter_pk_coefs / filter_ls_coefs / filter_hs_coefs
// and the direct-form-1 filter_process loop.
//
// The C code stores the 'a' coefficients negated so they are added in the
// accumulator. Here they keep their natural sign; tick() subtracts them — the
// standard floating-point convention.
// ─────────────────────────────────────────────────────────────────────────────
class BiquadFilter {
  private b0 = 1; private b1 = 0; private b2 = 0;
  private a1 = 0; private a2 = 0;
  active = false;

  // Direct-form-1 history for 2 channels:
  //   [L_x1, L_x2, L_y1, L_y2, R_x1, R_x2, R_y1, R_y2]
  private readonly h = new Float64Array(8);

  // filter_pk_coefs — peaking EQ band
  setPeaking(cutoff: number, q: number, gainDb: number, sr: number): void {
    if (gainDb === 0) { this.bypass(); return; }
    const A     = Math.pow(10, gainDb / 40);
    const w0    = (2 * Math.PI * cutoff) / sr;
    const sinw0 = Math.sin(w0), cosw0 = Math.cos(w0);
    const alpha = sinw0 / (2 * q);
    const ia0   = 1 / (1 + alpha / A);
    this.b0 =  (1 + alpha * A) * ia0;
    this.b1 =  -2 * cosw0      * ia0;
    this.b2 =  (1 - alpha * A) * ia0;
    this.a1 =  -2 * cosw0      * ia0; // same as b1 in peaking
    this.a2 =  (1 - alpha / A) * ia0;
    this.active = true;
  }

  // filter_ls_coefs — low-shelf (band 0)
  setLowShelf(cutoff: number, q: number, gainDb: number, sr: number): void {
    if (gainDb === 0) { this.bypass(); return; }
    const A     = Math.pow(10, gainDb / 40);
    const w0    = (2 * Math.PI * cutoff) / sr;
    const sinw0 = Math.sin(w0), cosw0 = Math.cos(w0);
    const alpha = sinw0 / (2 * q);
    const s2    = 2 * Math.sqrt(A) * alpha;
    const ia0   = 1 / ((A + 1) + (A - 1) * cosw0 + s2);
    this.b0 =  A * ((A + 1) - (A - 1) * cosw0 + s2) * ia0;
    this.b1 =  2 * A * ((A - 1) - (A + 1) * cosw0)  * ia0;
    this.b2 =  A * ((A + 1) - (A - 1) * cosw0 - s2) * ia0;
    this.a1 =  -2 * ((A - 1) + (A + 1) * cosw0)     * ia0;
    this.a2 =  ((A + 1) + (A - 1) * cosw0 - s2)     * ia0;
    this.active = true;
  }

  // filter_hs_coefs — high-shelf (band 9)
  setHighShelf(cutoff: number, q: number, gainDb: number, sr: number): void {
    if (gainDb === 0) { this.bypass(); return; }
    const A     = Math.pow(10, gainDb / 40);
    const w0    = (2 * Math.PI * cutoff) / sr;
    const sinw0 = Math.sin(w0), cosw0 = Math.cos(w0);
    const alpha = sinw0 / (2 * q);
    const s2    = 2 * Math.sqrt(A) * alpha;
    const ia0   = 1 / ((A + 1) - (A - 1) * cosw0 + s2);
    this.b0 =  A * ((A + 1) + (A - 1) * cosw0 + s2)  * ia0;
    this.b1 =  -2 * A * ((A - 1) + (A + 1) * cosw0)  * ia0;
    this.b2 =  A * ((A + 1) + (A - 1) * cosw0 - s2)  * ia0;
    this.a1 =  2 * ((A - 1) - (A + 1) * cosw0)       * ia0;
    this.a2 =  ((A + 1) - (A - 1) * cosw0 - s2)      * ia0;
    this.active = true;
  }

  bypass(): void {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.active = false;
  }

  flush(): void { this.h.fill(0); }

  // Direct-form-1 — filter_process (generic C fallback)
  // y[n] = b0*x + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
  tick(x: number, ch: 0 | 1): number {
    const o = ch << 2; // ch * 4
    const h = this.h;
    const y = this.b0 * x
            + this.b1 * h[o]     // x[n-1]
            + this.b2 * h[o + 1] // x[n-2]
            - this.a1 * h[o + 2] // y[n-1]
            - this.a2 * h[o + 3];// y[n-2]
    h[o + 1] = h[o];     h[o]     = x;
    h[o + 3] = h[o + 2]; h[o + 2] = y;
    return y;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RingBuffer
// Port of the enqueue / dequeue helpers at the bottom of dsp_filter.c.
// Physical size is fixed at construction; 'len' passed per-call sets the active
// wrap boundary so that the same object can serve different logical delay sizes.
// ─────────────────────────────────────────────────────────────────────────────
class RingBuffer {
  private readonly buf: Float32Array;
  private r = 0;
  private w = 0;

  constructor(maxSize: number) {
    this.buf = new Float32Array(maxSize);
  }

  flush(): void { this.buf.fill(0); this.r = 0; this.w = 0; }

  dequeue(len: number): number {
    const v = this.buf[this.r];
    if (++this.r >= len) this.r = 0;
    return v;
  }

  enqueue(v: number, len: number): void {
    this.buf[this.w] = v;
    if (++this.w >= len) this.w = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Equalizer
// Port of eq.c: 10-band EQ.
//   band 0          → low-shelf  (filter_ls_coefs)
//   bands 1–8       → peaking    (filter_pk_coefs)
//   band 9          → high-shelf (filter_hs_coefs)
// Bands with gain === 0 are bypassed (active = false) at zero CPU cost.
// ─────────────────────────────────────────────────────────────────────────────
const EQ_BANDS = 10;

class Equalizer {
  private readonly filters: BiquadFilter[] = Array.from(
    { length: EQ_BANDS }, () => new BiquadFilter(),
  );
  private precut     = 1.0;   // linear gain (< 1 for headroom)
  private sampleRate = 44100;
  private readonly cfg: BandConfig[] = Array.from(
    { length: EQ_BANDS }, () => ({ cutoff: 1000, q: 0.7, gain: 0 }),
  );

  setSampleRate(sr: number): void {
    this.sampleRate = sr;
    this.rebuildAll();
  }

  setBand(band: number, cutoff: number, q: number, gain: number): void {
    if (band < 0 || band >= EQ_BANDS) return;
    this.cfg[band] = { cutoff, q, gain };
    this.rebuild(band);
  }

  // precut_db: positive value reduces pre-EQ gain to prevent clipping on boosts
  setPrecut(precutDb: number): void {
    this.precut = Math.pow(10, -Math.abs(precutDb) / 20);
  }

  flush(): void { this.filters.forEach(f => f.flush()); }

  // Process one stereo sample pair in range [-1, 1]; returns [left, right].
  process(left: number, right: number): [number, number] {
    left  *= this.precut;
    right *= this.precut;
    for (let b = 0; b < EQ_BANDS; b++) {
      const f = this.filters[b];
      if (!f.active) continue;
      left  = f.tick(left,  0);
      right = f.tick(right, 1);
    }
    return [left, right];
  }

  private rebuild(band: number): void {
    const { cutoff, q, gain } = this.cfg[band];
    const f  = this.filters[band];
    const sr = this.sampleRate;
    if (band === 0)
      f.setLowShelf(cutoff, q, gain, sr);
    else if (band === EQ_BANDS - 1)
      f.setHighShelf(cutoff, q, gain, sr);
    else
      f.setPeaking(cutoff, q, gain, sr);
  }

  private rebuildAll(): void {
    for (let b = 0; b < EQ_BANDS; b++) this.rebuild(b);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Surround
// Port of surround.c: Haas-effect pseudo-surround.
//
// Five delay lines carry frequency-weighted copies of the right channel with
// different delay lengths, creating a spacious stereo image without changing
// the mono content. The left channel receives an inverted, delayed crossfeed
// signal to further widen the image.
//
// Delay sizing note: the C source uses DLY_1US = 90900, calibrated for ~90.9 kHz
// internal rate. This port computes delay directly from sampleRate so it is
// sample-rate agnostic (44100, 48000, 96000 Hz all work correctly).
// ─────────────────────────────────────────────────────────────────────────────
const SURROUND_BUF_MAX = 8192; // fits 30 ms at up to 192 kHz

class Surround {
  private sampleRate = 44100;
  private delayMs    = 15;
  private mix        = 1.0;   // 0 (dry) … 1 (wet)
  private balance    = 0;     // -100 … +100
  private sideOnly   = false;
  private cutoffL    = 320;   // Hz — bass/voice crossover  (C: cutoff_l, fx2)
  private cutoffH    = 3400;  // Hz — voice/treble crossover (C: cutoff_h, fx1)

  // Derived per-update
  private dly = 0;
  private tc1 = 0; // tcoef1 = cutoffL / sr
  private tc2 = 0; // tcoef2 = cutoffH / sr
  private bc  = 0; // bcoef  = (cutoffL/2) / sr
  private hc  = 0; // hcoef  = (cutoffH*2) / sr

  // Five independent ring-buffer delay lines
  private readonly b0 = new RingBuffer(SURROUND_BUF_MAX); // dly >> 3
  private readonly bb = new RingBuffer(SURROUND_BUF_MAX); // dly >> 2
  private readonly hh = new RingBuffer(SURROUND_BUF_MAX); // dly >> 1
  private readonly b2 = new RingBuffer(SURROUND_BUF_MAX); // dly
  private readonly cl = new RingBuffer(SURROUND_BUF_MAX); // dly (crossfeed left)

  constructor() { this.update(); }

  setSampleRate(sr: number): void  { this.sampleRate = sr;                                    this.update(); }
  setDelay(ms: number): void       { this.delayMs    = Math.max(5, Math.min(30, ms));          this.update(); }
  setMix(pct: number): void        { this.mix        = Math.max(0, Math.min(100, pct)) / 100;               }
  setBalance(b: number): void      { this.balance    = Math.max(-100, Math.min(100, b));                     }
  setSideOnly(v: boolean): void    { this.sideOnly   = v;                                                    }
  setCutoffs(low: number, high: number): void { this.cutoffL = low; this.cutoffH = high; this.update(); }

  flush(): void {
    this.b0.flush(); this.bb.flush(); this.hh.flush();
    this.b2.flush(); this.cl.flush();
  }

  // Mirrors surround_update_filter + surround_set_delay in surround.c.
  private update(): void {
    const sr  = this.sampleRate;
    this.dly  = Math.max(1, Math.round((this.delayMs / 1000) * sr));
    this.tc1  = this.cutoffL / sr;
    this.tc2  = this.cutoffH / sr;
    this.bc   = (this.cutoffL / 2) / sr;
    this.hc   = (this.cutoffH * 2) / sr;
    this.flush();
  }

  // Per-sample processing — mirrors the loop body of surround_process().
  process(left: number, right: number): [number, number] {
    const { dly, tc1, tc2, bc, hc } = this;
    const d8 = Math.max(1, dly >> 3);
    const d4 = Math.max(1, dly >> 2);
    const d2 = Math.max(1, dly >> 1);

    let temp0: number, temp1: number;

    if (!this.sideOnly) {
      temp0 = left;
      temp1 = right * tc1 - right * tc2; // voice-band weighted copy
    } else {
      const side = left - right;
      temp0 =  side * 0.5;
      temp1 = -side * tc1 * 0.5 - (-side) * tc2 * 0.5;
    }

    // Inverted crossfeed: adds delayed, negated fraction to the left channel
    const cx = temp1 * 0.35;
    temp0 += this.cl.dequeue(dly);
    this.cl.enqueue(-cx, dly);

    // 1/8 delay — high-pass of right at cutoffL (~320 Hz)
    let x = right * (1 - tc1);
    temp1 += this.b0.dequeue(d8);
    this.b0.enqueue(x, d8);

    // Attenuate below half of cutoffL (~160 Hz)
    temp1 = temp1 * bc;

    // 1/4 delay — high-pass of right at cutoffL/2 (~160 Hz)
    x      = right * (1 - bc);
    temp1 += this.bb.dequeue(d4);
    this.bb.enqueue(x, d4);

    // Full delay — band above cutoffH (~3400 Hz)
    x      = right * tc2;
    temp1 += this.b2.dequeue(dly);
    this.b2.enqueue(x, dly);

    // 1/2 delay direction trick — band above 2×cutoffH (~6800 Hz)
    temp1  = temp1 * (1 - hc);
    x      = right * hc;
    temp1 += this.hh.dequeue(d2);
    this.hh.enqueue(x, d2);

    // Balance
    const bal = this.balance;
    if (bal > 0) {
      if (!this.sideOnly) {
        temp0 -= (temp0 * bal) / 200;
        temp1 += (temp1 * bal) / 200;
      } else {
        temp0 += (temp0 * bal) / 200;
        temp1 -= (temp1 * bal) / 200;
      }
    }

    // Re-add mono (mid) content in side-only mode
    if (this.sideOnly) {
      const mid = left * 0.5 + right * 0.5;
      temp0 += mid;
      temp1 += mid;
    }

    // Dry/wet mix
    const wet = this.mix;
    if (wet >= 1) return [temp0, temp1];
    const dry = 1 - wet;
    return [left * dry + temp0 * wet, right * dry + temp1 * wet];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RockboxDSPProcessor
// ─────────────────────────────────────────────────────────────────────────────
class RockboxDSPProcessor extends AudioWorkletProcessor {
  private readonly eq       = new Equalizer();
  private readonly surround = new Surround();
  private eqOn   = false;
  private surrOn = false;
  private lastSr = -1;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<DspMessage>) => this.recv(data);
  }

  private recv(msg: DspMessage): void {
    switch (msg.type) {
      case 'eq.enable':       this.eqOn           = msg.value;                             break;
      case 'eq.band':         this.eq.setBand(msg.band, msg.cutoff, msg.q, msg.gain);      break;
      case 'eq.precut':       this.eq.setPrecut(msg.value);                                break;
      case 'eq.flush':        this.eq.flush();                                             break;
      case 'surround.enable': this.surrOn         = msg.value;                             break;
      case 'surround.delay':  this.surround.setDelay(msg.value);                           break;
      case 'surround.mix':    this.surround.setMix(msg.value);                             break;
      case 'surround.balance':this.surround.setBalance(msg.value);                         break;
      case 'surround.sideOnly':this.surround.setSideOnly(msg.value);                       break;
      case 'surround.cutoffs':this.surround.setCutoffs(msg.low, msg.high);                 break;
      case 'surround.flush':  this.surround.flush();                                       break;
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0], out = outputs[0];
    if (!inp?.[0]?.length) return true;

    if (this.lastSr !== sampleRate) {
      this.lastSr = sampleRate;
      this.eq.setSampleRate(sampleRate);
      this.surround.setSampleRate(sampleRate);
    }

    const inL  = inp[0];
    const inR  = inp[1] ?? inp[0];
    const outL = out[0];
    const outR = out[1] ?? null;
    const n    = inL.length;

    for (let i = 0; i < n; i++) {
      let l = inL[i], r = inR[i];

      if (this.eqOn)   [l, r] = this.eq.process(l, r);
      if (this.surrOn) [l, r] = this.surround.process(l, r);

      outL[i] = l;
      if (outR) outR[i] = r;
    }

    return true;
  }
}

registerProcessor('rockbox-dsp', RockboxDSPProcessor);
