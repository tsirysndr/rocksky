//! A ListenBrainz-compatible API over the Rocksky catalogue.
//!
//! # What this is for
//!
//! ListenBrainz clients do not only submit listens — they read back
//! everything they display. A client pointed at a server that implements only
//! `submit-listens` and `validate-token` signs in, scrobbles correctly, and
//! then shows an empty screen everywhere else, because every other screen it
//! has is a `GET` against one of the endpoints below.
//!
//! So the read side is not a nicety here; it is the difference between the
//! app working and the app looking broken. The set implemented is the set a
//! full client actually calls:
//!
//! | endpoint                                    | what it draws              |
//! |---------------------------------------------|----------------------------|
//! | `user/{name}/listens`                       | the scrobbles list         |
//! | `user/{name}/playing-now`                   | the now-playing row        |
//! | `user/{name}/listen-count`                  | the total in the drawer    |
//! | `user/{name}/following`, `/followers`       | the friends list           |
//! | `stats/user/{name}/artists`                 | the top-artists chart      |
//! | `stats/user/{name}/releases`                | the top-albums chart       |
//! | `stats/user/{name}/recordings`              | the top-tracks chart       |
//! | `stats/user/{name}/release-groups`          | the same, grouped          |
//! | `stats/user/{name}/listening-activity`      | the bar chart above them   |
//! | `feedback/user/{name}/get-feedback`         | the loved-tracks list      |
//! | `feedback/recording-feedback`               | the heart button           |
//! | `search/users`                              | the user search            |
//! | `metadata/lookup`                           | id resolution              |
//!
//! # Reads are public, writes are not
//!
//! A Rocksky profile is public, and ListenBrainz's own read endpoints are too
//! for a non-private account, so the `GET`s here do not require a token — a
//! client asking about somebody else's listening gets an answer, which is
//! what makes the friends screen work at all. Anything that writes requires
//! one.

pub mod catalogue;
pub mod core;
pub mod feedback;
pub mod handlers;
pub mod metadata;
pub mod msid;
pub mod range;
pub mod statistics;
pub mod types;
pub mod users;

#[cfg(test)]
mod tests;
