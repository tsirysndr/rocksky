import { parseBuffer } from "music-metadata";

const orNull = (v) => (v === undefined ? null : v);
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === "number" ? v : null);

const trackNumber = (t) => ({ no: num(t?.no), of: num(t?.of) });

const firstPicture = (pics) => {
  const p = arr(pics)[0];
  if (!p) return null;
  const d = p.data;
  return { format: p.format, data: Buffer.isBuffer(d) ? d : Buffer.from(d.buffer, d.byteOffset, d.byteLength) };
};

const lyricsText = (tags) => {
  for (const t of arr(tags)) {
    if (typeof t?.text === "string" && t.text.length > 0) return t.text;
    if (Array.isArray(t?.syncText) && t.syncText.length > 0) return t.syncText.map((l) => l.text).join("\n");
  }
  return null;
};

const common = (c) => ({
  title: orNull(c.title),
  artist: orNull(c.artist),
  artists: arr(c.artists),
  album: orNull(c.album),
  albumartist: orNull(c.albumartist),
  year: num(c.year),
  date: orNull(c.date),
  originaldate: orNull(c.originaldate),
  track: trackNumber(c.track),
  disk: trackNumber(c.disk),
  genre: arr(c.genre),
  composer: arr(c.composer),
  lyrics: lyricsText(c.lyrics),
  picture: firstPicture(c.picture),
  copyright: orNull(c.copyright),
  label: arr(c.label),
  isrc: arr(c.isrc),
  musicbrainzTrackid: orNull(c.musicbrainz_trackid),
  musicbrainzRecordingid: orNull(c.musicbrainz_recordingid),
  musicbrainzAlbumid: orNull(c.musicbrainz_albumid),
  musicbrainzReleasegroupid: orNull(c.musicbrainz_releasegroupid),
  musicbrainzArtistid: arr(c.musicbrainz_artistid),
  musicbrainzAlbumartistid: arr(c.musicbrainz_albumartistid),
  replaygainTrackGain: num(c.replaygain_track_gain?.dB),
  replaygainTrackPeak: num(c.replaygain_track_peak?.ratio),
});

const format = (f) => ({
  duration: num(f.duration),
  bitrate: num(f.bitrate),
  sampleRate: num(f.sampleRate),
  numberOfChannels: num(f.numberOfChannels),
  bitsPerSample: num(f.bitsPerSample),
  codec: orNull(f.codec),
  container: orNull(f.container),
  lossless: typeof f.lossless === "boolean" ? f.lossless : null,
  tagTypes: arr(f.tagTypes),
});

const native = (n) =>
  Object.fromEntries(Object.entries(n ?? {}).map(([k, tags]) => [k, arr(tags).map((t) => ({ id: t.id, value: t.value }))]));

export const parseBufferImpl = (buf) => (opts) => () =>
  parseBuffer(buf, opts.mimeType === null ? undefined : { mimeType: opts.mimeType }, { duration: opts.duration }).then(
    (m) => ({ common: common(m.common), format: format(m.format), native: native(m.native) }),
  );

export const parseUploadBufferImpl = buf => mimeType => () => parseBuffer(buf, { mimeType, duration: true });
