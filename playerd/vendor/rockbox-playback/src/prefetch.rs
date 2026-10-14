//! Prepare compressed audio only: Rockbox decoders share global state and
//! must never be opened alongside the currently playing decoder.
use crate::source::{self, HttpSource, Remote};
use std::thread::JoinHandle;

#[derive(Default)]
pub(crate) struct Prefetch {
    job: Option<(String, JoinHandle<Option<HttpSource>>)>,
}

impl Prefetch {
    /// Keep at most one download running. A changed queue target supersedes
    /// the old job once it finishes; never wait on the playback thread here.
    pub(crate) fn update(&mut self, target: Option<&str>) {
        if let Some((url, job)) = &self.job {
            if Some(url.as_str()) == target || !job.is_finished() {
                return;
            }
        }
        self.job = None;
        let Some(url) = target.filter(|url| source::is_url(url)) else {
            return;
        };
        let request = url.to_owned();
        if let Ok(job) = std::thread::Builder::new()
            .name("rbprefetch".into())
            .spawn(move || {
                // Bound stale requests, including stalled response bodies.
                // Live/adaptive streams are opened normally at transition.
                let Remote::File(mut source) = source::open_remote_for_prefetch(&request).ok()?
                else {
                    return None;
                };
                source.ensure_complete().ok()?;
                Some(source)
            })
        {
            self.job = Some((url.to_owned(), job));
        }
    }

    /// Only consume a matching source. If its download is still running at
    /// the boundary, reuse that work instead of issuing a second download.
    pub(crate) fn take(&mut self, url: &str) -> Option<HttpSource> {
        if self.job.as_ref().is_some_and(|(target, _)| target == url) {
            self.job.take()?.1.join().ok().flatten()
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn queue_edits_do_not_wait_for_or_consume_a_stale_download() {
        let (release, wait) = mpsc::channel();
        let mut prefetch = Prefetch {
            job: Some((
                "http://old/track".into(),
                std::thread::spawn(move || {
                    wait.recv().unwrap();
                    None
                }),
            )),
        };
        // These must return before the worker is released, with no second
        // worker launched for each successive edit.
        prefetch.update(Some("http://new/track"));
        assert!(prefetch.take("http://new/track").is_none());
        prefetch.update(None);
        assert_eq!(prefetch.job.as_ref().unwrap().0, "http://old/track");
        release.send(()).unwrap();
        assert!(prefetch.take("http://old/track").is_none());
        assert!(prefetch.job.is_none());
    }

    #[test]
    fn failed_prefetch_is_not_retried_every_decode_step() {
        let worker = std::thread::spawn(|| None);
        while !worker.is_finished() {
            std::thread::yield_now();
        }
        let id = worker.thread().id();
        let mut prefetch = Prefetch {
            job: Some(("http://failed/track".into(), worker)),
        };
        prefetch.update(Some("http://failed/track"));
        assert_eq!(prefetch.job.as_ref().unwrap().1.thread().id(), id);
        prefetch.update(Some("local.wav"));
        assert!(prefetch.job.is_none());
    }
}

