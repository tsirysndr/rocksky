//! `POST /1/delete-listen`.
//!
//! Not implemented, and answered as such rather than silently.
//!
//! A Rocksky scrobble is a record in the user's own repository; the row here
//! is a projection of it. Deleting the row would leave the record, and the
//! next sync would put the row straight back — so a "deleted" listen would
//! reappear minutes later, which is worse for the person who asked than being
//! told it cannot be done. Nothing in this repository can delete the record:
//! there is no such procedure in the lexicon and no route in the API, so
//! there is nothing for this endpoint to call.
//!
//! It answers `501` with the reason, which clients surface as a failed
//! delete. When scrobble deletion does land in `app.rocksky.scrobble`, this
//! is the one place that has to change.

use actix_web::HttpResponse;

use crate::listenbrainz::types::ApiError;

pub const REASON: &str =
    "Rocksky cannot delete a listen: a scrobble lives in your own repository and this \
     service has no way to remove it there. Delete it from the Rocksky app instead.";

pub fn delete_listen() -> HttpResponse {
    HttpResponse::NotImplemented().json(ApiError::new(501, REASON))
}
