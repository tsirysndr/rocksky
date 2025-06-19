use base64::prelude::*;
use rand::seq::SliceRandom;
use rand::thread_rng;
use serde_json::json;
use std::f32::consts::PI;
use std::io::Cursor;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn extract_audio_metadata(data: &[u8]) -> JsValue {
    let media_source: Box<dyn MediaSource> = Box::new(Cursor::new(data.to_vec()));
    let mss = MediaSourceStream::new(media_source, Default::default());

    let hint = Hint::new();

    let meta_opts = MetadataOptions::default();
    let format_opts = FormatOptions::default();

    let mut probed =
        match symphonia::default::get_probe().format(&hint, mss, &format_opts, &meta_opts) {
            Ok(probed) => probed,
            Err(_) => return JsValue::NULL, // Return null if the format is unsupported
        };

    let mut metadata = json!({});

    // Extract metadata tags
    if let Some(track) = probed.format.metadata().current() {
        for tag in track.tags() {
            if let Some(key) = tag.std_key {
                metadata[&format!("{:?}", key)] = serde_json::Value::String(tag.value.to_string());
            }
        }

        // Extract album art if available
        if let Some(cover) = track
            .visuals()
            .iter()
            .find(|v| v.media_type.starts_with("image/"))
        {
            let base64_image = BASE64_STANDARD.encode(&cover.data);
            let mime_type = &cover.media_type;
            metadata["album_art"] = json!({
                "data": base64_image,
                "mime": mime_type,
            });
        }
    }

    if let Some(track) = probed.format.tracks().first() {
        if let Some(duration) = track.codec_params.n_frames {
            if let Some(sample_rate) = track.codec_params.sample_rate {
                let duration_seconds = duration as f64 / sample_rate as f64;
                metadata["Duration"] = json!(duration_seconds);
            }
        }
    }

    JsValue::from_str(serde_json::to_string(&metadata).unwrap().as_str())
}

#[wasm_bindgen]
pub struct AudioDecoder {
    pcm_data: Vec<f32>,
    sample_rate: u32,
    channels: u16,
}

#[wasm_bindgen]
impl AudioDecoder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            pcm_data: Vec::new(),
            sample_rate: 44100,
            channels: 2,
        }
    }

    #[wasm_bindgen]
    pub fn decode(&mut self, audio_data: &[u8], ext: &str) -> Result<(), JsValue> {
        let media_source: Box<dyn MediaSource> = Box::new(Cursor::new(audio_data.to_vec()));

        let mss = MediaSourceStream::new(media_source, Default::default());

        let mut hint = Hint::new();
        hint.with_extension(ext);

        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                mss,
                &FormatOptions {
                    enable_gapless: false,
                    ..Default::default()
                },
                &MetadataOptions::default(),
            )
            .map_err(|e| JsValue::from_str(&format!("Failed to read format: {}", e)))?;

        let mut format = probed.format;
        let track = format
            .default_track()
            .ok_or_else(|| JsValue::from_str("No default track found"))?;
        let codec_params = &track.codec_params;

        if codec_params.codec == CODEC_TYPE_NULL {
            return Err(JsValue::from_str("Unsupported codec"));
        }

        let mut decoder = symphonia::default::get_codecs()
            .make(&codec_params, &DecoderOptions::default())
            .map_err(|e| JsValue::from_str(&format!("Failed to create decoder: {}", e)))?;

        self.sample_rate = codec_params.sample_rate.unwrap_or(44100);
        self.channels = 2;

        while let Ok(packet) = format.next_packet() {
            let decoded = decoder
                .decode(&packet)
                .map_err(|e| JsValue::from_str(&format!("Decode error: {}", e)))?;
            let mut sample_buf =
                SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
            sample_buf.copy_interleaved_ref(decoded);

            self.pcm_data.extend(sample_buf.samples());
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_pcm_data(&self) -> Vec<f32> {
        self.pcm_data.clone()
    }

    #[wasm_bindgen]
    pub fn get_sample_rate(&self) -> u32 {
        self.sample_rate
    }

    #[wasm_bindgen]
    pub fn get_channels(&self) -> u16 {
        self.channels
    }
}

#[wasm_bindgen]
pub enum FadeCurve {
    Linear,
    Exponential,
    Logarithmic,
}

/// Crossfades between two audio buffers using a specified fade curve
#[wasm_bindgen]
pub fn crossfade(
    buffer_a: &[f32],
    buffer_b: &[f32],
    fade_duration: usize,
    fade_curve: FadeCurve,
) -> Vec<f32> {
    let len_a = buffer_a.len();
    let len_b = buffer_b.len();

    let crossfade_len = fade_duration.min(len_a).min(len_b);
    let mut output = Vec::with_capacity(len_a + len_b - crossfade_len);

    // Copy the first part of buffer A
    output.extend_from_slice(&buffer_a[..len_a - crossfade_len]);

    // Apply the crossfade
    for i in 0..crossfade_len {
        let t = i as f32 / crossfade_len as f32;
        let (fade_out, fade_in) = match fade_curve {
            FadeCurve::Linear => (1.0 - t, t),
            FadeCurve::Exponential => ((1.0 - t).powi(2), t.powi(2)),
            FadeCurve::Logarithmic => (1.0 - t.ln_1p(), t.ln_1p()),
        };

        let mixed_sample = buffer_a[len_a - crossfade_len + i] * fade_out + buffer_b[i] * fade_in;

        output.push(mixed_sample);
    }

    // Copy the remaining part of buffer B
    output.extend_from_slice(&buffer_b[crossfade_len..]);

    output
}

#[wasm_bindgen]
pub struct BiquadFilter {
    a0: f32,
    a1: f32,
    a2: f32,
    b0: f32,
    b1: f32,
    b2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

#[wasm_bindgen]
impl BiquadFilter {
    // Create a new peaking EQ filter
    #[wasm_bindgen]
    pub fn peaking_eq(sample_rate: f32, frequency: f32, q: f32, gain_db: f32) -> Self {
        let omega = 2.0 * PI * frequency / sample_rate;
        let alpha = omega.sin() / (2.0 * q);
        let a = 10.0_f32.powf(gain_db / 40.0);

        let cos_omega = omega.cos();

        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * cos_omega;
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha / a;

        BiquadFilter {
            a0,
            a1,
            a2,
            b0,
            b1,
            b2,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    // Process a single sample through the filter
    #[wasm_bindgen]
    pub fn process(&mut self, input: f32) -> f32 {
        let output = (self.b0 / self.a0) * input
            + (self.b1 / self.a0) * self.x1
            + (self.b2 / self.a0) * self.x2
            - (self.a1 / self.a0) * self.y1
            - (self.a2 / self.a0) * self.y2;

        // Update filter state
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;

        output
    }

    // Update filter parameters
    #[wasm_bindgen]
    pub fn update_parameters(&mut self, sample_rate: f32, frequency: f32, q: f32, gain_db: f32) {
        let omega = 2.0 * PI * frequency / sample_rate;
        let alpha = omega.sin() / (2.0 * q);
        let a = 10.0_f32.powf(gain_db / 40.0);

        let cos_omega = omega.cos();

        self.b0 = 1.0 + alpha * a;
        self.b1 = -2.0 * cos_omega;
        self.b2 = 1.0 - alpha * a;
        self.a0 = 1.0 + alpha / a;
        self.a1 = -2.0 * cos_omega;
        self.a2 = 1.0 - alpha / a;
    }
}

// 12-band equalizer
#[wasm_bindgen]
pub struct Equalizer {
    bands: Vec<BiquadFilter>,
    sample_rate: f32,
}

#[wasm_bindgen]
impl Equalizer {
    // Create a new 12-band equalizer with standard frequency bands
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        // Standard frequency bands for a 12-band EQ (in Hz)
        let frequencies = [
            31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 12000.0, 16000.0,
            20000.0,
        ];

        let mut bands = Vec::with_capacity(frequencies.len());

        // Create a filter for each frequency band with default gain of 0 dB
        for &freq in &frequencies {
            bands.push(BiquadFilter::peaking_eq(sample_rate, freq, 1.414, 0.0));
        }

        Equalizer { bands, sample_rate }
    }

    // Set gain for a specific band
    #[wasm_bindgen]
    pub fn set_band_gain(&mut self, band_index: usize, gain_db: f32) {
        if band_index >= self.bands.len() {
            return;
        }

        // Standard frequency bands
        let frequencies = [
            31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 12000.0, 16000.0,
            20000.0,
        ];

        // Update the filter parameters with the new gain
        let frequency = frequencies[band_index];
        let q = 1.414; // Standard Q value for EQ bands
        self.bands[band_index].update_parameters(self.sample_rate, frequency, q, gain_db);
    }

    // Process a single sample through all EQ bands
    #[wasm_bindgen]
    pub fn process(&mut self, input: f32) -> f32 {
        let mut output = input;

        // Pass the input through each band filter in series
        for band in &mut self.bands {
            output = band.process(output);
        }

        output
    }

    // Process a buffer of samples
    #[wasm_bindgen]
    pub fn process_buffer(&mut self, input_buffer: &[f32], output_buffer: &mut [f32]) {
        assert_eq!(input_buffer.len(), output_buffer.len());

        for i in 0..input_buffer.len() {
            output_buffer[i] = self.process(input_buffer[i]);
        }
    }
}

#[wasm_bindgen]
pub struct AudioFilter {
    sample_rate: f32,
    // Common filter state variables
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
    // Additional states for higher order filters
    x3: f32,
    x4: f32,
    y3: f32,
    y4: f32,
}

#[wasm_bindgen]
impl AudioFilter {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
            x3: 0.0,
            x4: 0.0,
            y3: 0.0,
            y4: 0.0,
        }
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
        self.x3 = 0.0;
        self.x4 = 0.0;
        self.y3 = 0.0;
        self.y4 = 0.0;
    }
}

#[wasm_bindgen]
pub struct LowShelfFilter {
    filter: AudioFilter,
    a1: f32,
    a2: f32,
    b0: f32,
    b1: f32,
    b2: f32,
}

#[wasm_bindgen]
impl LowShelfFilter {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32, frequency: f32, gain_db: f32, q: f32) -> Self {
        let mut filter = Self {
            filter: AudioFilter::new(sample_rate),
            a1: 0.0,
            a2: 0.0,
            b0: 0.0,
            b1: 0.0,
            b2: 0.0,
        };
        filter.set_parameters(frequency, gain_db, q);
        filter
    }

    #[wasm_bindgen]
    pub fn set_parameters(&mut self, frequency: f32, gain_db: f32, q: f32) {
        let a = 10.0_f32.powf(gain_db / 40.0);
        let omega = 2.0 * std::f32::consts::PI * frequency / self.filter.sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);
        let beta = (a + 1.0 / a).sqrt() * 2.0 * alpha;

        let b0 = a * ((a + 1.0) - (a - 1.0) * cos_omega + beta);
        let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_omega);
        let b2 = a * ((a + 1.0) - (a - 1.0) * cos_omega - beta);
        let a0 = (a + 1.0) + (a - 1.0) * cos_omega + beta;
        let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_omega);
        let a2 = (a + 1.0) + (a - 1.0) * cos_omega - beta;

        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }

    #[wasm_bindgen]
    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.filter.x1 + self.b2 * self.filter.x2
            - self.a1 * self.filter.y1
            - self.a2 * self.filter.y2;

        self.filter.x2 = self.filter.x1;
        self.filter.x1 = input;
        self.filter.y2 = self.filter.y1;
        self.filter.y1 = output;

        output
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.filter.reset();
    }
}

#[wasm_bindgen]
pub struct HighShelfFilter {
    filter: AudioFilter,
    a1: f32,
    a2: f32,
    b0: f32,
    b1: f32,
    b2: f32,
}

#[wasm_bindgen]
impl HighShelfFilter {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32, frequency: f32, gain_db: f32, q: f32) -> Self {
        let mut filter = Self {
            filter: AudioFilter::new(sample_rate),
            a1: 0.0,
            a2: 0.0,
            b0: 0.0,
            b1: 0.0,
            b2: 0.0,
        };
        filter.set_parameters(frequency, gain_db, q);
        filter
    }

    #[wasm_bindgen]
    pub fn set_parameters(&mut self, frequency: f32, gain_db: f32, q: f32) {
        let a = 10.0_f32.powf(gain_db / 40.0);
        let omega = 2.0 * std::f32::consts::PI * frequency / self.filter.sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);
        let beta = (a + 1.0 / a).sqrt() * 2.0 * alpha;

        let b0 = a * ((a + 1.0) + (a - 1.0) * cos_omega + beta);
        let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_omega);
        let b2 = a * ((a + 1.0) + (a - 1.0) * cos_omega - beta);
        let a0 = (a + 1.0) - (a - 1.0) * cos_omega + beta;
        let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_omega);
        let a2 = (a + 1.0) - (a - 1.0) * cos_omega - beta;

        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }

    #[wasm_bindgen]
    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.filter.x1 + self.b2 * self.filter.x2
            - self.a1 * self.filter.y1
            - self.a2 * self.filter.y2;

        self.filter.x2 = self.filter.x1;
        self.filter.x1 = input;
        self.filter.y2 = self.filter.y1;
        self.filter.y1 = output;

        output
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.filter.reset();
    }
}

#[wasm_bindgen]
pub struct BandPassFilter {
    filter: AudioFilter,
    a1: f32,
    a2: f32,
    b0: f32,
    b1: f32,
    b2: f32,
}

#[wasm_bindgen]
impl BandPassFilter {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32, frequency: f32, q: f32) -> Self {
        let mut filter = Self {
            filter: AudioFilter::new(sample_rate),
            a1: 0.0,
            a2: 0.0,
            b0: 0.0,
            b1: 0.0,
            b2: 0.0,
        };
        filter.set_parameters(frequency, q);
        filter
    }

    #[wasm_bindgen]
    pub fn set_parameters(&mut self, frequency: f32, q: f32) {
        let omega = 2.0 * std::f32::consts::PI * frequency / self.filter.sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * q);

        let b0 = alpha;
        let b1 = 0.0;
        let b2 = -alpha;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }

    #[wasm_bindgen]
    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.filter.x1 + self.b2 * self.filter.x2
            - self.a1 * self.filter.y1
            - self.a2 * self.filter.y2;

        self.filter.x2 = self.filter.x1;
        self.filter.x1 = input;
        self.filter.y2 = self.filter.y1;
        self.filter.y1 = output;

        output
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.filter.reset();
    }
}

#[wasm_bindgen]
pub struct BesselFilter {
    filter: AudioFilter,
    order: usize,
    // Coefficients for sections
    a: Vec<Vec<f32>>,
    b: Vec<Vec<f32>>,
}

#[wasm_bindgen]
impl BesselFilter {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32, cutoff_frequency: f32, order: usize) -> Self {
        if order != 4 && order != 8 {
            panic!("Only 4th and 8th order Bessel filters are implemented");
        }

        let mut filter = Self {
            filter: AudioFilter::new(sample_rate),
            order,
            a: vec![],
            b: vec![],
        };
        filter.set_parameters(cutoff_frequency);
        filter
    }

    #[wasm_bindgen]
    pub fn set_parameters(&mut self, cutoff_frequency: f32) {
        let fs = self.filter.sample_rate;
        let fc = cutoff_frequency;

        // Clear previous coefficients
        self.a = vec![];
        self.b = vec![];

        // Normalized frequency
        let omega_c = 2.0 * std::f32::consts::PI * fc / fs;

        // Bessel polynomials for 4th and 8th order
        // These are the poles of the normalized (omega_c = 1) Bessel filter
        let poles = if self.order == 4 {
            vec![
                (-0.6572111112819416, 0.8301614350048806),
                (-0.6572111112819416, -0.8301614350048806),
                (-0.9047587967882449, 0.2709187330038746),
                (-0.9047587967882449, -0.2709187330038746),
            ]
        } else {
            // 8th order
            vec![
                (-0.5905759446119192, 0.9072067564574548),
                (-0.5905759446119192, -0.9072067564574548),
                (-0.6707106781186548, 0.7937387988730166),
                (-0.6707106781186548, -0.7937387988730166),
                (-0.7996541858328288, 0.6000376420593046),
                (-0.7996541858328288, -0.6000376420593046),
                (-0.8717401485096066, 0.3349881501782813),
                (-0.8717401485096066, -0.3349881501782813),
            ]
        };

        // Create second-order sections from complex conjugate pairs
        for section in poles.chunks(2) {
            let (real, imag) = section[0];

            // Bilinear transform to map s-plane to z-plane
            let c = 1.0 / (omega_c * 2.0);
            let d = 1.0 + real * c;
            let e = real * real + imag * imag;

            let b0 = 1.0 / d;
            let b1 = 2.0 / d;
            let b2 = 1.0 / d;

            let a0 = 1.0;
            let a1 = 2.0 * (1.0 - e * c * c) / d;
            let a2 = (1.0 - 2.0 * real * c + e * c * c) / d;

            self.b.push(vec![b0, b1, b2]);
            self.a.push(vec![a0, a1, a2]);
        }
    }

    #[wasm_bindgen]
    pub fn process(&mut self, input: f32) -> f32 {
        let num_sections = self.order / 2;
        let mut output = input;

        for i in 0..num_sections {
            let x = output;

            output =
                self.b[i][0] * x + self.b[i][1] * self.filter.x1 + self.b[i][2] * self.filter.x2
                    - self.a[i][1] * self.filter.y1
                    - self.a[i][2] * self.filter.y2;

            self.filter.x2 = self.filter.x1;
            self.filter.x1 = x;
            self.filter.y2 = self.filter.y1;
            self.filter.y1 = output;
        }

        output
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.filter.reset();
    }
}

#[wasm_bindgen]
pub struct LinkwitzRileyFilter {
    filter: AudioFilter,
    // For 8th order (48 dB/Oct) we need 4 biquad sections
    a: Vec<Vec<f32>>,
    b: Vec<Vec<f32>>,
    state: Vec<Vec<f32>>, // x1, x2, y1, y2 for each section
}

#[wasm_bindgen]
impl LinkwitzRileyFilter {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32, cutoff_frequency: f32, filter_type: FilterType) -> Self {
        let mut filter = Self {
            filter: AudioFilter::new(sample_rate),
            a: vec![vec![0.0; 3]; 4], // 4 biquad sections, each with 3 coefficients
            b: vec![vec![0.0; 3]; 4],
            state: vec![vec![0.0; 4]; 4], // 4 states per section
        };
        filter.set_parameters(cutoff_frequency, filter_type);
        filter
    }

    #[wasm_bindgen]
    pub fn set_parameters(&mut self, cutoff_frequency: f32, filter_type: FilterType) {
        let omega_c = 2.0 * std::f32::consts::PI * cutoff_frequency / self.filter.sample_rate;
        let k = omega_c.tan();

        // Butterworth poles for 8th order (48 dB/Oct)
        let poles = [
            (-0.9808, 0.1951),
            (-0.9808, -0.1951),
            (-0.8315, 0.5556),
            (-0.8315, -0.5556),
            (-0.5556, 0.8315),
            (-0.5556, -0.8315),
            (-0.1951, 0.9808),
            (-0.1951, -0.9808),
        ];

        // Process each section (4 sections for 8th order)
        for i in 0..4 {
            let (real, imag) = poles[i * 2];

            // Bilinear transform
            let d = 1.0 + real * k + (real * real + imag * imag) * k * k;

            match filter_type {
                FilterType::LowPass => {
                    let k_squared = k * k;
                    self.b[i][0] = k_squared / d;
                    self.b[i][1] = 2.0 * k_squared / d;
                    self.b[i][2] = k_squared / d;
                    self.a[i][0] = 1.0;
                    self.a[i][1] = 2.0 * (k_squared - 1.0) / d;
                    self.a[i][2] = (1.0 - real * k + (real * real + imag * imag) * k * k) / d;
                }
                FilterType::HighPass => {
                    self.b[i][0] = 1.0 / d;
                    self.b[i][1] = -2.0 / d;
                    self.b[i][2] = 1.0 / d;
                    self.a[i][0] = 1.0;
                    self.a[i][1] = 2.0 * (k * k - 1.0) / d;
                    self.a[i][2] = (1.0 - real * k + (real * real + imag * imag) * k * k) / d;
                }
            }
        }
    }

    #[wasm_bindgen]
    pub fn process(&mut self, input: f32) -> f32 {
        let mut output = input;

        for i in 0..4 {
            let x = output;

            // Apply the biquad filter
            output = self.b[i][0] * x
                + self.b[i][1] * self.state[i][0]
                + self.b[i][2] * self.state[i][1]
                - self.a[i][1] * self.state[i][2]
                - self.a[i][2] * self.state[i][3];

            // Update states
            self.state[i][1] = self.state[i][0];
            self.state[i][0] = x;
            self.state[i][3] = self.state[i][2];
            self.state[i][2] = output;
        }

        output
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        for i in 0..4 {
            for j in 0..4 {
                self.state[i][j] = 0.0;
            }
        }
    }
}

#[wasm_bindgen]
pub enum FilterType {
    LowPass,
    HighPass,
}

#[wasm_bindgen]
pub struct Playlist {
    tracks: Vec<String>,
    current_track: usize,
}

#[wasm_bindgen]
impl Playlist {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            tracks: Vec::new(),
            current_track: 0,
        }
    }

    #[wasm_bindgen]
    pub fn add_track(&mut self, track: &str) -> usize {
        self.tracks.push(track.to_string());
        self.tracks.len()
    }

    #[wasm_bindgen]
    pub fn next_track(&mut self) -> String {
        if self.tracks.is_empty() {
            return String::new();
        }

        self.current_track = (self.current_track + 1) % self.tracks.len();
        self.tracks[self.current_track].clone()
    }

    #[wasm_bindgen]
    pub fn previous_track(&mut self) -> String {
        if self.tracks.is_empty() {
            return String::new();
        }

        if self.current_track == 0 {
            self.current_track = self.tracks.len() - 1;
        } else {
            self.current_track -= 1;
        }

        self.tracks[self.current_track].clone()
    }

    #[wasm_bindgen]
    pub fn current_track(&self) -> String {
        if self.tracks.is_empty() {
            return String::new();
        }

        self.tracks[self.current_track].clone()
    }

    #[wasm_bindgen]
    pub fn clear(&mut self) {
        self.tracks.clear();
        self.current_track = 0;
    }

    #[wasm_bindgen]
    pub fn size(&self) -> usize {
        self.tracks.len()
    }

    #[wasm_bindgen]
    pub fn current_index(&self) -> usize {
        self.current_track
    }

    #[wasm_bindgen]
    pub fn set_current_index(&mut self, index: usize) {
        if index < self.tracks.len() {
            self.current_track = index;
        }
    }

    #[wasm_bindgen]
    pub fn remove_track(&mut self, index: usize) {
        if index < self.tracks.len() {
            self.tracks.remove(index);
        }
    }

    #[wasm_bindgen]
    pub fn get_track(&self, index: usize) -> String {
        if index < self.tracks.len() {
            self.tracks[index].clone()
        } else {
            String::new()
        }
    }

    #[wasm_bindgen]

    pub fn get_tracks(&self) -> js_sys::Array {
        self.tracks.iter().map(|t| JsValue::from_str(t)).collect()
    }

    #[wasm_bindgen]
    pub fn shuffle(&mut self) {
        let mut rng = thread_rng();
        self.tracks.shuffle(&mut rng);
    }

    #[wasm_bindgen]
    pub fn insert_track(&mut self, index: usize, track: &str) {
        if index <= self.tracks.len() {
            self.tracks.insert(index, track.to_string());
        }
    }

    #[wasm_bindgen]
    pub fn get_next_track(&self) -> String {
        if self.tracks.is_empty() {
            return String::new();
        }

        let next_track = (self.current_track + 1) % self.tracks.len();
        self.tracks[next_track].clone()
    }

    #[wasm_bindgen]
    pub fn get_next_tracks(&self) -> js_sys::Array {
        if self.tracks.is_empty() {
            return js_sys::Array::new();
        }

        let current_track = self.current_track;
        let next_tracks: Vec<String> = self
            .tracks
            .iter()
            .skip(current_track + 1)
            .cloned()
            .collect();
        next_tracks.iter().map(|t| JsValue::from_str(t)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_playlist_add_and_get_tracks() {
        let mut playlist = Playlist::new();
        playlist.add_track("Track 1");
        playlist.add_track("Track 2");
        playlist.add_track("Track 3");

        assert_eq!(playlist.size(), 3);
        assert_eq!(playlist.get_track(0), "Track 1");
        assert_eq!(playlist.get_track(1), "Track 2");
        assert_eq!(playlist.get_track(2), "Track 3");
    }

    #[test]
    fn test_playlist_navigation() {
        let mut playlist = Playlist::new();
        playlist.add_track("Track 1");
        playlist.add_track("Track 2");
        playlist.add_track("Track 3");

        assert_eq!(playlist.current_track(), "Track 1");
        assert_eq!(playlist.next_track(), "Track 2");
        assert_eq!(playlist.next_track(), "Track 3");
        assert_eq!(playlist.next_track(), "Track 1");

        assert_eq!(playlist.previous_track(), "Track 3");
        assert_eq!(playlist.previous_track(), "Track 2");
        assert_eq!(playlist.previous_track(), "Track 1");
    }

    #[test]
    fn test_playlist_clear() {
        let mut playlist = Playlist::new();
        playlist.add_track("Track 1");
        playlist.add_track("Track 2");

        assert_eq!(playlist.size(), 2);
        playlist.clear();
        assert_eq!(playlist.size(), 0);
        assert_eq!(playlist.current_track(), "");
    }

    #[test]
    fn test_playlist_remove_track() {
        let mut playlist = Playlist::new();
        playlist.add_track("Track 1");
        playlist.add_track("Track 2");
        playlist.add_track("Track 3");

        playlist.remove_track(1);
        assert_eq!(playlist.size(), 2);
        assert_eq!(playlist.get_track(0), "Track 1");
        assert_eq!(playlist.get_track(1), "Track 3");
    }

    #[test]
    fn test_playlist_insert_track() {
        let mut playlist = Playlist::new();
        playlist.add_track("Track 1");
        playlist.add_track("Track 3");

        playlist.insert_track(1, "Track 2");
        assert_eq!(playlist.size(), 3);
        assert_eq!(playlist.get_track(0), "Track 1");
        assert_eq!(playlist.get_track(1), "Track 2");
        assert_eq!(playlist.get_track(2), "Track 3");
    }

    #[test]
    fn test_playlist_set_current_index() {
        let mut playlist = Playlist::new();
        playlist.add_track("Track 1");
        playlist.add_track("Track 2");
        playlist.add_track("Track 3");

        playlist.set_current_index(2);
        assert_eq!(playlist.current_track(), "Track 3");

        playlist.set_current_index(0);
        assert_eq!(playlist.current_track(), "Track 1");
    }

    #[test]
    fn test_playlist_get_next_track() {
        let mut playlist = Playlist::new();
        playlist.add_track("Track 1");
        playlist.add_track("Track 2");
        playlist.add_track("Track 3");

        assert_eq!(playlist.get_next_track(), "Track 2");
        playlist.next_track();
        assert_eq!(playlist.get_next_track(), "Track 3");
    }
}
