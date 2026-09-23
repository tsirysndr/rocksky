//! Node.js bindings for `rocksky-analysis` — key, tempo and AcoustID
//! fingerprint.
//!
//! Two entry points, both non-blocking:
//!
//! * `analyze(buffer, extensionHint?)` — one track, on Node's libuv worker
//!   pool. This is what the upload path calls: the request thread hands the
//!   bytes off and returns immediately.
//! * `analyzeBatch(items, onProgress?)` — many tracks, fanned out across all
//!   cores on rayon's thread pool from a dedicated thread. Progress events are
//!   delivered to `onProgress` on the JS thread as each track finishes, so a
//!   backfill can log as it goes instead of at the end.

use neon::prelude::*;
use neon::types::buffer::TypedArray;
use rocksky_analysis::Analysis;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

fn set_opt_f32<'a, C: Context<'a>>(
    cx: &mut C,
    obj: &Handle<'a, JsObject>,
    name: &str,
    value: Option<f32>,
) -> NeonResult<()> {
    match value {
        Some(v) => {
            let v = cx.number(v as f64);
            obj.set(cx, name, v)?;
        }
        None => {
            let null = cx.null();
            obj.set(cx, name, null)?;
        }
    }
    Ok(())
}

fn set_opt_str<'a, C: Context<'a>>(
    cx: &mut C,
    obj: &Handle<'a, JsObject>,
    name: &str,
    value: Option<&str>,
) -> NeonResult<()> {
    match value {
        Some(v) => {
            let v = cx.string(v);
            obj.set(cx, name, v)?;
        }
        None => {
            let null = cx.null();
            obj.set(cx, name, null)?;
        }
    }
    Ok(())
}

fn analysis_to_object<'a, C: Context<'a>>(
    cx: &mut C,
    analysis: &Analysis,
) -> JsResult<'a, JsObject> {
    let obj = cx.empty_object();
    set_opt_f32(cx, &obj, "bpm", analysis.bpm)?;
    set_opt_f32(cx, &obj, "bpmConfidence", analysis.bpm_confidence)?;
    set_opt_str(cx, &obj, "key", analysis.key.as_deref())?;
    set_opt_f32(cx, &obj, "keyConfidence", analysis.key_confidence)?;
    set_opt_str(cx, &obj, "fingerprint", analysis.fingerprint.as_deref())?;
    let duration = cx.number(analysis.duration as f64);
    obj.set(cx, "duration", duration)?;
    Ok(obj)
}

fn opt_string_arg(cx: &mut FunctionContext, index: usize) -> NeonResult<Option<String>> {
    match cx.argument_opt(index) {
        Some(value) if !value.is_a::<JsUndefined, _>(cx) && !value.is_a::<JsNull, _>(cx) => {
            let value = value.downcast_or_throw::<JsString, _>(cx)?;
            Ok(Some(value.value(cx)))
        }
        _ => Ok(None),
    }
}

/// `analyze(buffer, extensionHint?) -> Promise<AudioAnalysis>`
fn analyze(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let bytes = cx.argument::<JsBuffer>(0)?.as_slice(&cx).to_vec();
    let hint = opt_string_arg(&mut cx, 1)?;

    let promise = cx
        .task(move || rocksky_analysis::analyze(&bytes, hint.as_deref()))
        .promise(|mut cx, result| match result {
            Ok(analysis) => analysis_to_object(&mut cx, &analysis),
            Err(cause) => cx.throw_error(format!("{cause:#}")),
        });

    Ok(promise)
}

struct BatchItem {
    id: Option<String>,
    bytes: Vec<u8>,
    hint: Option<String>,
}

/// What one finished track reports, carried from a rayon worker to JS.
struct ProgressEvent {
    id: Option<String>,
    index: usize,
    completed: usize,
    total: usize,
    ok: bool,
    bpm: Option<f32>,
    key: Option<String>,
    /// Whether a fingerprint came out. The fingerprint itself is a kilobyte of
    /// base64 that no progress line wants to print.
    fingerprint: bool,
    error: Option<String>,
}

/// `analyzeBatch(items, onProgress?) -> Promise<BatchResult[]>`
///
/// `items` is `[{ id?, buffer, extensionHint? }]`. The batch runs on a
/// dedicated thread and fans out on rayon, so N tracks use all cores without
/// touching the libuv pool. `onProgress` is called on the JS thread once per
/// track, in completion order.
fn analyze_batch(mut cx: FunctionContext) -> JsResult<JsPromise> {
    let items_js = cx.argument::<JsArray>(0)?;
    let length = items_js.len(&mut cx);

    let mut items: Vec<BatchItem> = Vec::with_capacity(length as usize);
    for index in 0..length {
        let item: Handle<JsObject> = items_js.get(&mut cx, index)?;

        let id = match item.get_value(&mut cx, "id")? {
            v if v.is_a::<JsString, _>(&mut cx) => {
                Some(v.downcast_or_throw::<JsString, _>(&mut cx)?.value(&mut cx))
            }
            _ => None,
        };
        let buffer: Handle<JsBuffer> = item.get(&mut cx, "buffer")?;
        let bytes = buffer.as_slice(&cx).to_vec();
        let hint = match item.get_value(&mut cx, "extensionHint")? {
            v if v.is_a::<JsString, _>(&mut cx) => {
                Some(v.downcast_or_throw::<JsString, _>(&mut cx)?.value(&mut cx))
            }
            _ => None,
        };
        items.push(BatchItem { id, bytes, hint });
    }

    let on_progress: Option<Arc<Root<JsFunction>>> = match cx.argument_opt(1) {
        Some(value) if value.is_a::<JsFunction, _>(&mut cx) => Some(Arc::new(
            value
                .downcast_or_throw::<JsFunction, _>(&mut cx)?
                .root(&mut cx),
        )),
        _ => None,
    };

    let channel = cx.channel();
    let (deferred, promise) = cx.promise();

    std::thread::spawn(move || {
        let total = items.len();
        let ids: Vec<Option<String>> = items.iter().map(|item| item.id.clone()).collect();
        let payload: Vec<(Vec<u8>, Option<String>)> = items
            .into_iter()
            .map(|item| (item.bytes, item.hint))
            .collect();

        let completed = AtomicUsize::new(0);
        let progress_channel = channel.clone();

        let results = rocksky_analysis::analyze_batch(&payload, |index, result| {
            let completed = completed.fetch_add(1, Ordering::SeqCst) + 1;
            let Some(callback) = &on_progress else {
                return;
            };
            let event = ProgressEvent {
                id: ids[index].clone(),
                index,
                completed,
                total,
                ok: result.is_ok(),
                bpm: result.as_ref().ok().and_then(|a| a.bpm),
                key: result.as_ref().ok().and_then(|a| a.key.clone()),
                fingerprint: result
                    .as_ref()
                    .ok()
                    .is_some_and(|a| a.fingerprint.is_some()),
                error: result.as_ref().err().map(|e| format!("{e:#}")),
            };
            let callback = Arc::clone(callback);
            progress_channel.send(move |mut cx| {
                let obj = cx.empty_object();
                set_opt_str(&mut cx, &obj, "id", event.id.as_deref())?;
                let index = cx.number(event.index as f64);
                obj.set(&mut cx, "index", index)?;
                let done = cx.number(event.completed as f64);
                obj.set(&mut cx, "completed", done)?;
                let total = cx.number(event.total as f64);
                obj.set(&mut cx, "total", total)?;
                let ok = cx.boolean(event.ok);
                obj.set(&mut cx, "ok", ok)?;
                set_opt_f32(&mut cx, &obj, "bpm", event.bpm)?;
                set_opt_str(&mut cx, &obj, "key", event.key.as_deref())?;
                let fingerprint = cx.boolean(event.fingerprint);
                obj.set(&mut cx, "fingerprint", fingerprint)?;
                set_opt_str(&mut cx, &obj, "error", event.error.as_deref())?;

                let this = cx.undefined();
                callback
                    .to_inner(&mut cx)
                    .call(&mut cx, this, vec![obj.upcast::<JsValue>()])?;
                Ok(())
            });
        });

        // anyhow errors flattened to strings so the results can cross threads
        // as plain data.
        let results: Vec<(Option<String>, Result<Analysis, String>)> = ids
            .into_iter()
            .zip(results)
            .map(|(id, result)| (id, result.map_err(|e| format!("{e:#}"))))
            .collect();

        deferred.settle_with(&channel, move |mut cx| {
            let array = cx.empty_array();
            for (position, (id, result)) in results.iter().enumerate() {
                let obj = cx.empty_object();
                set_opt_str(&mut cx, &obj, "id", id.as_deref())?;
                match result {
                    Ok(analysis) => {
                        let ok = cx.boolean(true);
                        obj.set(&mut cx, "ok", ok)?;
                        let analysis = analysis_to_object(&mut cx, analysis)?;
                        obj.set(&mut cx, "analysis", analysis)?;
                        let null = cx.null();
                        obj.set(&mut cx, "error", null)?;
                    }
                    Err(error) => {
                        let ok = cx.boolean(false);
                        obj.set(&mut cx, "ok", ok)?;
                        let null = cx.null();
                        obj.set(&mut cx, "analysis", null)?;
                        let error = cx.string(error);
                        obj.set(&mut cx, "error", error)?;
                    }
                }
                array.set(&mut cx, position as u32, obj)?;
            }
            Ok(array)
        });
    });

    Ok(promise)
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("analyze", analyze)?;
    cx.export_function("analyzeBatch", analyze_batch)?;
    Ok(())
}
