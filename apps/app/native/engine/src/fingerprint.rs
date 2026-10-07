//! Explicit single-track analysis only; never called by the scanner.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rusty_chromaprint::{Configuration, FingerprintCompressor, Fingerprinter};
use std::{fs::File, path::Path};
use symphonia::core::{
    audio::SampleBuffer, codecs::DecoderOptions, io::MediaSourceStream, probe::Hint,
};

pub fn read(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let mut format = symphonia::default::get_probe()
        .format(&hint, source, &Default::default(), &Default::default())
        .map_err(|e| e.to_string())?
        .format;
    let track = format.default_track().ok_or("No audio stream")?;
    let id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;
    let config = Configuration::preset_test2();
    let mut printer = Fingerprinter::new(&config);
    let mut remaining = None;
    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != id {
            continue;
        }
        let decoded = decoder.decode(&packet).map_err(|e| e.to_string())?;
        let spec = *decoded.spec();
        let channels = spec.channels.count();
        if remaining.is_none() {
            printer
                .start(spec.rate, channels as u32)
                .map_err(|e| e.to_string())?;
            remaining = Some(spec.rate as usize * 120);
        }
        let mut buffer = SampleBuffer::<i16>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        let wanted = (buffer.samples().len() / channels).min(remaining.unwrap());
        printer.consume(&buffer.samples()[..wanted * channels]);
        remaining = Some(remaining.unwrap() - wanted);
        if remaining == Some(0) {
            break;
        }
    }
    if remaining.is_none() {
        return Err("No audio could be decoded".into());
    }
    printer.finish();
    if printer.fingerprint().is_empty() {
        return Err("Audio is too short to identify".into());
    }
    Ok(
        URL_SAFE_NO_PAD
            .encode(FingerprintCompressor::from(&config).compress(printer.fingerprint())),
    )
}
