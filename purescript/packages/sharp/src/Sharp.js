import sharp from "sharp";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const orNull = (v) => (v === undefined ? null : v);

export const fromBuffer = (buf) => () => sharp(buf);
export const resize = (s) => (opts) => () => s.resize(dropNulls(opts));
export const toFormat = (s) => (fmt) => () => s.toFormat(fmt);
export const jpeg = (s) => (quality) => () => s.jpeg(dropNulls({ quality }));
export const webp = (s) => (quality) => () => s.webp(dropNulls({ quality }));
export const png = (s) => () => s.png();
export const toBufferImpl = (s) => () => s.toBuffer();
export const metadataImpl = (s) => () =>
  s.metadata().then((m) => ({
    width: orNull(m.width),
    height: orNull(m.height),
    format: orNull(m.format),
    size: orNull(m.size),
    hasAlpha: orNull(m.hasAlpha),
  }));
