//! `app.rocksky.event.*` — indexed music events and their RSVPs.

use crate::client::Client;
use crate::error::Result;
use crate::generated::{
    EventRsvpView, EventView, GetEventParams, GetEventRsvpsOutput, GetEventRsvpsParams,
    GetEventsOutput, GetEventsParams, PutRsvpInput, PutRsvpOutput,
};

#[derive(Debug)]
pub struct EventApi<'a> {
    client: &'a Client,
}

impl<'a> EventApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Start building a `getEvents` call: indexed music events, soonest first.
    /// Without a time window only unexpired events are returned.
    /// XRPC: `app.rocksky.event.getEvents`.
    pub fn list(&self) -> ListEvents<'_> {
        ListEvents {
            client: self.client,
            params: GetEventsParams::default(),
            auth: false,
        }
    }

    /// One music event by the AT-URI of either its calendar event record or its
    /// `app.rocksky.event.music` record.
    /// XRPC: `app.rocksky.event.getEvent`.
    pub async fn get(&self, uri: impl Into<String>) -> Result<EventView> {
        self.client
            .query_as(
                "app.rocksky.event.getEvent",
                &GetEventParams { uri: uri.into() },
                false,
            )
            .await
    }

    /// Start building a `getEventRsvps` call: who responded to an event, most
    /// recent first.
    /// XRPC: `app.rocksky.event.getEventRsvps`.
    pub fn rsvps(&self, uri: impl Into<String>) -> GetEventRsvps<'_> {
        GetEventRsvps {
            client: self.client,
            params: GetEventRsvpsParams {
                uri: uri.into(),
                ..Default::default()
            },
        }
    }

    /// Set the authenticated caller's RSVP on an event. `status` is a
    /// `community.lexicon.calendar.rsvp#{going,interested,notgoing}` token; an
    /// existing RSVP record is reused.
    /// XRPC: `app.rocksky.event.putRsvp` (auth required).
    pub async fn put_rsvp(
        &self,
        uri: impl Into<String>,
        status: impl Into<String>,
    ) -> Result<PutRsvpOutput> {
        self.client
            .procedure_as(
                "app.rocksky.event.putRsvp",
                None::<&()>,
                Some(&PutRsvpInput {
                    uri: uri.into(),
                    status: status.into(),
                }),
                true,
            )
            .await
    }
}

#[derive(Debug)]
pub struct ListEvents<'a> {
    client: &'a Client,
    params: GetEventsParams,
    auth: bool,
}

impl<'a> ListEvents<'a> {
    /// Only events this artist plays: the artist's AT-URI, id or sha256.
    pub fn artist(mut self, artist: impl Into<String>) -> Self {
        self.params.artist = Some(artist.into());
        self
    }

    /// Only events published by this repo.
    pub fn did(mut self, did: impl Into<String>) -> Self {
        self.params.did = Some(did.into());
        self
    }

    /// Only events this DID has RSVP'd to (going or interested).
    pub fn rsvp_by(mut self, did: impl Into<String>) -> Self {
        self.params.rsvp_by = Some(did.into());
        self
    }

    /// Only events of this kind (concert, festival...).
    pub fn kind(mut self, kind: impl Into<String>) -> Self {
        self.params.kind = Some(kind.into());
        self
    }

    /// Only events whose genre matches (case-insensitive).
    pub fn genre(mut self, genre: impl Into<String>) -> Self {
        self.params.genre = Some(genre.into());
        self
    }

    /// Only events that end at or after this time.
    pub fn from(mut self, from: chrono::DateTime<chrono::Utc>) -> Self {
        self.params.from = Some(from);
        self
    }

    /// Only events that start at or before this time.
    pub fn to(mut self, to: chrono::DateTime<chrono::Utc>) -> Self {
        self.params.to = Some(to);
        self
    }

    /// Return past events too, most recent first, instead of upcoming ones.
    pub fn include_past(mut self, include_past: bool) -> Self {
        self.params.include_past = Some(include_past);
        self
    }

    pub fn limit(mut self, limit: i64) -> Self {
        self.params.limit = Some(limit);
        self
    }

    pub fn offset(mut self, offset: i64) -> Self {
        self.params.offset = Some(offset);
        self
    }

    /// Send the client's bearer token so each event carries the caller's own
    /// `viewer_rsvp`. Fails with a missing-token error if none is configured.
    pub fn as_viewer(mut self) -> Self {
        self.auth = true;
        self
    }

    pub async fn send(self) -> Result<Vec<EventView>> {
        let out: GetEventsOutput = self
            .client
            .query_as("app.rocksky.event.getEvents", &self.params, self.auth)
            .await?;
        Ok(out.events)
    }
}

#[derive(Debug)]
pub struct GetEventRsvps<'a> {
    client: &'a Client,
    params: GetEventRsvpsParams,
}

impl<'a> GetEventRsvps<'a> {
    /// Only responses with this `community.lexicon.calendar.rsvp#…` status.
    pub fn status(mut self, status: impl Into<String>) -> Self {
        self.params.status = Some(status.into());
        self
    }

    pub fn limit(mut self, limit: i64) -> Self {
        self.params.limit = Some(limit);
        self
    }

    pub fn offset(mut self, offset: i64) -> Self {
        self.params.offset = Some(offset);
        self
    }

    pub async fn send(self) -> Result<Vec<EventRsvpView>> {
        let out: GetEventRsvpsOutput = self
            .client
            .query_as("app.rocksky.event.getEventRsvps", &self.params, false)
            .await?;
        Ok(out.rsvps)
    }
}

/// Builder for `app.rocksky.artist.getArtistEvents`; see
/// [`crate::resources::ArtistApi::get_events`].
#[derive(Debug)]
pub struct GetArtistEvents<'a> {
    client: &'a Client,
    params: crate::generated::GetArtistEventsParams,
}

impl<'a> GetArtistEvents<'a> {
    pub(crate) fn new(client: &'a Client, uri: String) -> Self {
        Self {
            client,
            params: crate::generated::GetArtistEventsParams {
                uri,
                ..Default::default()
            },
        }
    }

    /// Return past events too, most recent first.
    pub fn include_past(mut self, include_past: bool) -> Self {
        self.params.include_past = Some(include_past);
        self
    }

    pub fn limit(mut self, limit: i64) -> Self {
        self.params.limit = Some(limit);
        self
    }

    pub fn offset(mut self, offset: i64) -> Self {
        self.params.offset = Some(offset);
        self
    }

    pub async fn send(self) -> Result<Vec<EventView>> {
        let out: crate::generated::GetArtistEventsOutput = self
            .client
            .query_as("app.rocksky.artist.getArtistEvents", &self.params, false)
            .await?;
        Ok(out.events)
    }
}
