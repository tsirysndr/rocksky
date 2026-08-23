class BiquadFilter {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  active = false;
  // Direct-form-1 history for 2 channels:
  //   [L_x1, L_x2, L_y1, L_y2, R_x1, R_x2, R_y1, R_y2]
  h = new Float64Array(8);
  // filter_pk_coefs — peaking EQ band
  setPeaking(cutoff, q, gainDb, sr) {
    if (gainDb === 0) {
      this.bypass();
      return;
    }
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * cutoff / sr;
    const sinw0 = Math.sin(w0), cosw0 = Math.cos(w0);
    const alpha = sinw0 / (2 * q);
    const ia0 = 1 / (1 + alpha / A);
    this.b0 = (1 + alpha * A) * ia0;
    this.b1 = -2 * cosw0 * ia0;
    this.b2 = (1 - alpha * A) * ia0;
    this.a1 = -2 * cosw0 * ia0;
    this.a2 = (1 - alpha / A) * ia0;
    this.active = true;
  }
  // filter_ls_coefs — low-shelf (band 0)
  setLowShelf(cutoff, q, gainDb, sr) {
    if (gainDb === 0) {
      this.bypass();
      return;
    }
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * cutoff / sr;
    const sinw0 = Math.sin(w0), cosw0 = Math.cos(w0);
    const alpha = sinw0 / (2 * q);
    const s2 = 2 * Math.sqrt(A) * alpha;
    const ia0 = 1 / (A + 1 + (A - 1) * cosw0 + s2);
    this.b0 = A * (A + 1 - (A - 1) * cosw0 + s2) * ia0;
    this.b1 = 2 * A * (A - 1 - (A + 1) * cosw0) * ia0;
    this.b2 = A * (A + 1 - (A - 1) * cosw0 - s2) * ia0;
    this.a1 = -2 * (A - 1 + (A + 1) * cosw0) * ia0;
    this.a2 = (A + 1 + (A - 1) * cosw0 - s2) * ia0;
    this.active = true;
  }
  // filter_hs_coefs — high-shelf (band 9)
  setHighShelf(cutoff, q, gainDb, sr) {
    if (gainDb === 0) {
      this.bypass();
      return;
    }
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * cutoff / sr;
    const sinw0 = Math.sin(w0), cosw0 = Math.cos(w0);
    const alpha = sinw0 / (2 * q);
    const s2 = 2 * Math.sqrt(A) * alpha;
    const ia0 = 1 / (A + 1 - (A - 1) * cosw0 + s2);
    this.b0 = A * (A + 1 + (A - 1) * cosw0 + s2) * ia0;
    this.b1 = -2 * A * (A - 1 + (A + 1) * cosw0) * ia0;
    this.b2 = A * (A + 1 + (A - 1) * cosw0 - s2) * ia0;
    this.a1 = 2 * (A - 1 - (A + 1) * cosw0) * ia0;
    this.a2 = (A + 1 - (A - 1) * cosw0 - s2) * ia0;
    this.active = true;
  }
  bypass() {
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.active = false;
  }
  flush() {
    this.h.fill(0);
  }
  // Direct-form-1 — filter_process (generic C fallback)
  // y[n] = b0*x + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
  tick(x, ch) {
    const o = ch << 2;
    const h = this.h;
    const y = this.b0 * x + this.b1 * h[o] + this.b2 * h[o + 1] - this.a1 * h[o + 2] - this.a2 * h[o + 3];
    h[o + 1] = h[o];
    h[o] = x;
    h[o + 3] = h[o + 2];
    h[o + 2] = y;
    return y;
  }
}
class RingBuffer {
  buf;
  r = 0;
  w = 0;
  constructor(maxSize) {
    this.buf = new Float32Array(maxSize);
  }
  flush() {
    this.buf.fill(0);
    this.r = 0;
    this.w = 0;
  }
  dequeue(len) {
    const v = this.buf[this.r];
    if (++this.r >= len) this.r = 0;
    return v;
  }
  enqueue(v, len) {
    this.buf[this.w] = v;
    if (++this.w >= len) this.w = 0;
  }
}
const EQ_BANDS = 10;
class Equalizer {
  filters = Array.from(
    { length: EQ_BANDS },
    () => new BiquadFilter()
  );
  precut = 1;
  // linear gain (< 1 for headroom)
  sampleRate = 44100;
  cfg = Array.from(
    { length: EQ_BANDS },
    () => ({ cutoff: 1e3, q: 0.7, gain: 0 })
  );
  setSampleRate(sr) {
    this.sampleRate = sr;
    this.rebuildAll();
  }
  setBand(band, cutoff, q, gain) {
    if (band < 0 || band >= EQ_BANDS) return;
    this.cfg[band] = { cutoff, q, gain };
    this.rebuild(band);
  }
  // precut_db: positive value reduces pre-EQ gain to prevent clipping on boosts
  setPrecut(precutDb) {
    this.precut = Math.pow(10, -Math.abs(precutDb) / 20);
  }
  flush() {
    this.filters.forEach((f) => f.flush());
  }
  // Process one stereo sample pair in range [-1, 1]; returns [left, right].
  process(left, right) {
    left *= this.precut;
    right *= this.precut;
    for (let b = 0; b < EQ_BANDS; b++) {
      const f = this.filters[b];
      if (!f.active) continue;
      left = f.tick(left, 0);
      right = f.tick(right, 1);
    }
    return [left, right];
  }
  rebuild(band) {
    const { cutoff, q, gain } = this.cfg[band];
    const f = this.filters[band];
    const sr = this.sampleRate;
    if (band === 0)
      f.setLowShelf(cutoff, q, gain, sr);
    else if (band === EQ_BANDS - 1)
      f.setHighShelf(cutoff, q, gain, sr);
    else
      f.setPeaking(cutoff, q, gain, sr);
  }
  rebuildAll() {
    for (let b = 0; b < EQ_BANDS; b++) this.rebuild(b);
  }
}
const SURROUND_BUF_MAX = 8192;
class Surround {
  sampleRate = 44100;
  delayMs = 15;
  mix = 1;
  // 0 (dry) … 1 (wet)
  balance = 0;
  // -100 … +100
  sideOnly = false;
  cutoffL = 320;
  // Hz — bass/voice crossover  (C: cutoff_l, fx2)
  cutoffH = 3400;
  // Hz — voice/treble crossover (C: cutoff_h, fx1)
  // Derived per-update
  dly = 0;
  tc1 = 0;
  // tcoef1 = cutoffL / sr
  tc2 = 0;
  // tcoef2 = cutoffH / sr
  bc = 0;
  // bcoef  = (cutoffL/2) / sr
  hc = 0;
  // hcoef  = (cutoffH*2) / sr
  // Five independent ring-buffer delay lines
  b0 = new RingBuffer(SURROUND_BUF_MAX);
  // dly >> 3
  bb = new RingBuffer(SURROUND_BUF_MAX);
  // dly >> 2
  hh = new RingBuffer(SURROUND_BUF_MAX);
  // dly >> 1
  b2 = new RingBuffer(SURROUND_BUF_MAX);
  // dly
  cl = new RingBuffer(SURROUND_BUF_MAX);
  // dly (crossfeed left)
  constructor() {
    this.update();
  }
  setSampleRate(sr) {
    this.sampleRate = sr;
    this.update();
  }
  setDelay(ms) {
    this.delayMs = Math.max(5, Math.min(30, ms));
    this.update();
  }
  setMix(pct) {
    this.mix = Math.max(0, Math.min(100, pct)) / 100;
  }
  setBalance(b) {
    this.balance = Math.max(-100, Math.min(100, b));
  }
  setSideOnly(v) {
    this.sideOnly = v;
  }
  setCutoffs(low, high) {
    this.cutoffL = low;
    this.cutoffH = high;
    this.update();
  }
  flush() {
    this.b0.flush();
    this.bb.flush();
    this.hh.flush();
    this.b2.flush();
    this.cl.flush();
  }
  // Mirrors surround_update_filter + surround_set_delay in surround.c.
  update() {
    const sr = this.sampleRate;
    this.dly = Math.max(1, Math.round(this.delayMs / 1e3 * sr));
    this.tc1 = this.cutoffL / sr;
    this.tc2 = this.cutoffH / sr;
    this.bc = this.cutoffL / 2 / sr;
    this.hc = this.cutoffH * 2 / sr;
    this.flush();
  }
  // Per-sample processing — mirrors the loop body of surround_process().
  process(left, right) {
    const { dly, tc1, tc2, bc, hc } = this;
    const d8 = Math.max(1, dly >> 3);
    const d4 = Math.max(1, dly >> 2);
    const d2 = Math.max(1, dly >> 1);
    let temp0, temp1;
    if (!this.sideOnly) {
      temp0 = left;
      temp1 = right * tc1 - right * tc2;
    } else {
      const side = left - right;
      temp0 = side * 0.5;
      temp1 = -side * tc1 * 0.5 - -side * tc2 * 0.5;
    }
    const cx = temp1 * 0.35;
    temp0 += this.cl.dequeue(dly);
    this.cl.enqueue(-cx, dly);
    let x = right * (1 - tc1);
    temp1 += this.b0.dequeue(d8);
    this.b0.enqueue(x, d8);
    temp1 = temp1 * bc;
    x = right * (1 - bc);
    temp1 += this.bb.dequeue(d4);
    this.bb.enqueue(x, d4);
    x = right * tc2;
    temp1 += this.b2.dequeue(dly);
    this.b2.enqueue(x, dly);
    temp1 = temp1 * (1 - hc);
    x = right * hc;
    temp1 += this.hh.dequeue(d2);
    this.hh.enqueue(x, d2);
    const bal = this.balance;
    if (bal > 0) {
      if (!this.sideOnly) {
        temp0 -= temp0 * bal / 200;
        temp1 += temp1 * bal / 200;
      } else {
        temp0 += temp0 * bal / 200;
        temp1 -= temp1 * bal / 200;
      }
    }
    if (this.sideOnly) {
      const mid = left * 0.5 + right * 0.5;
      temp0 += mid;
      temp1 += mid;
    }
    const wet = this.mix;
    if (wet >= 1) return [temp0, temp1];
    const dry = 1 - wet;
    return [left * dry + temp0 * wet, right * dry + temp1 * wet];
  }
}
class RockboxDSPProcessor extends AudioWorkletProcessor {
  eq = new Equalizer();
  surround = new Surround();
  eqOn = false;
  surrOn = false;
  lastSr = -1;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => this.recv(data);
  }
  recv(msg) {
    switch (msg.type) {
      case "eq.enable":
        this.eqOn = msg.value;
        break;
      case "eq.band":
        this.eq.setBand(msg.band, msg.cutoff, msg.q, msg.gain);
        break;
      case "eq.precut":
        this.eq.setPrecut(msg.value);
        break;
      case "eq.flush":
        this.eq.flush();
        break;
      case "surround.enable":
        this.surrOn = msg.value;
        break;
      case "surround.delay":
        this.surround.setDelay(msg.value);
        break;
      case "surround.mix":
        this.surround.setMix(msg.value);
        break;
      case "surround.balance":
        this.surround.setBalance(msg.value);
        break;
      case "surround.sideOnly":
        this.surround.setSideOnly(msg.value);
        break;
      case "surround.cutoffs":
        this.surround.setCutoffs(msg.low, msg.high);
        break;
      case "surround.flush":
        this.surround.flush();
        break;
    }
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp?.[0]?.length) return true;
    if (this.lastSr !== sampleRate) {
      this.lastSr = sampleRate;
      this.eq.setSampleRate(sampleRate);
      this.surround.setSampleRate(sampleRate);
    }
    const inL = inp[0];
    const inR = inp[1] ?? inp[0];
    const outL = out[0];
    const outR = out[1] ?? null;
    const n = inL.length;
    for (let i = 0; i < n; i++) {
      let l = inL[i], r = inR[i];
      if (this.eqOn) [l, r] = this.eq.process(l, r);
      if (this.surrOn) [l, r] = this.surround.process(l, r);
      outL[i] = l;
      if (outR) outR[i] = r;
    }
    return true;
  }
}
registerProcessor("rockbox-dsp", RockboxDSPProcessor);
