use crate::{
    repo::RepoImpl,
    types::{FeedResult, Request, Scrobble, Uri},
};

/// A feed handler is responsible for
/// - Storing and managing firehose input.
/// - Serving responses to feed requests with `serve_feed`
pub trait FeedHandler {
    fn insert_scrobble(&self, scrobble: Scrobble) -> impl std::future::Future<Output = ()> + Send;
    fn delete_scrobble(&self, uri: Uri) -> impl std::future::Future<Output = ()> + Send;
    fn serve_feed(
        &self,
        repo: RepoImpl,
        request: Request,
    ) -> impl std::future::Future<Output = FeedResult> + Send;
}
