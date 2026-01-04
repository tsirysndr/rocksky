/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type LexiconDoc, Lexicons } from "@atproto/lexicon";

export const schemaDict = {
  FmTealAlphaActorDefs: {
    lexicon: 1,
    id: "fm.teal.alpha.actor.defs",
    defs: {
      profileView: {
        type: "object",
        properties: {
          did: {
            type: "string",
            description: "The decentralized identifier of the actor",
          },
          displayName: {
            type: "string",
          },
          description: {
            type: "string",
            description: "Free-form profile description text.",
          },
          descriptionFacets: {
            type: "array",
            description:
              "Annotations of text in the profile description (mentions, URLs, hashtags, etc). May be changed to another (backwards compatible) lexicon.",
            items: {
              type: "ref",
              ref: "lex:app.bsky.richtext.facet",
            },
          },
          featuredItem: {
            type: "ref",
            description:
              "The user's most recent item featured on their profile.",
            ref: "lex:fm.teal.alpha.actor.profile#featuredItem",
          },
          avatar: {
            type: "string",
            description: "IPLD of the avatar",
          },
          banner: {
            type: "string",
            description: "IPLD of the banner image",
          },
          createdAt: {
            type: "string",
            format: "datetime",
          },
        },
      },
      miniProfileView: {
        type: "object",
        properties: {
          did: {
            type: "string",
            description: "The decentralized identifier of the actor",
          },
          displayName: {
            type: "string",
          },
          handle: {
            type: "string",
          },
          avatar: {
            type: "string",
            description: "IPLD of the avatar",
          },
        },
      },
    },
  },
  FmTealAlphaActorGetProfile: {
    lexicon: 1,
    id: "fm.teal.alpha.actor.getProfile",
    description:
      "This lexicon is in a not officially released state. It is subject to change. | Retrieves a play given an author DID and record key.",
    defs: {
      main: {
        type: "query",
        parameters: {
          type: "params",
          required: ["actor"],
          properties: {
            actor: {
              type: "string",
              format: "at-identifier",
              description: "The author's DID",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["actor"],
            properties: {
              actor: {
                type: "ref",
                ref: "lex:fm.teal.alpha.actor.defs#profileView",
              },
            },
          },
        },
      },
    },
  },
  FmTealAlphaActorGetProfiles: {
    lexicon: 1,
    id: "fm.teal.alpha.actor.getProfiles",
    description:
      "This lexicon is in a not officially released state. It is subject to change. | Retrieves the associated profile.",
    defs: {
      main: {
        type: "query",
        parameters: {
          type: "params",
          required: ["actors"],
          properties: {
            actors: {
              type: "array",
              items: {
                type: "string",
                format: "at-identifier",
              },
              description: "Array of actor DIDs",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["actors"],
            properties: {
              actors: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:fm.teal.alpha.actor.defs#miniProfileView",
                },
              },
            },
          },
        },
      },
    },
  },
  FmTealAlphaActorProfile: {
    lexicon: 1,
    id: "fm.teal.alpha.actor.profile",
    defs: {
      main: {
        type: "record",
        description:
          "This lexicon is in a not officially released state. It is subject to change. | A declaration of a teal.fm account profile.",
        key: "literal:self",
        record: {
          type: "object",
          properties: {
            displayName: {
              type: "string",
              maxGraphemes: 64,
              maxLength: 640,
            },
            description: {
              type: "string",
              description: "Free-form profile description text.",
              maxGraphemes: 256,
              maxLength: 2560,
            },
            descriptionFacets: {
              type: "array",
              description:
                "Annotations of text in the profile description (mentions, URLs, hashtags, etc).",
              items: {
                type: "ref",
                ref: "lex:app.bsky.richtext.facet",
              },
            },
            featuredItem: {
              type: "ref",
              description:
                "The user's most recent item featured on their profile.",
              ref: "lex:fm.teal.alpha.actor.profile#featuredItem",
            },
            avatar: {
              type: "blob",
              description:
                "Small image to be displayed next to posts from account. AKA, 'profile picture'",
              accept: ["image/png", "image/jpeg"],
              maxSize: 1000000,
            },
            banner: {
              type: "blob",
              description:
                "Larger horizontal image to display behind profile view.",
              accept: ["image/png", "image/jpeg"],
              maxSize: 1000000,
            },
            createdAt: {
              type: "string",
              format: "datetime",
            },
          },
        },
      },
      featuredItem: {
        type: "object",
        required: ["mbid", "type"],
        properties: {
          mbid: {
            type: "string",
            description: "The Musicbrainz ID of the item",
          },
          type: {
            type: "string",
            description:
              "The type of the item. Must be a valid Musicbrainz type, e.g. album, track, recording, etc.",
          },
        },
      },
    },
  },
  FmTealAlphaActorSearchActors: {
    lexicon: 1,
    id: "fm.teal.alpha.actor.searchActors",
    description:
      "This lexicon is in a not officially released state. It is subject to change. | Searches for actors based on profile contents.",
    defs: {
      main: {
        type: "query",
        parameters: {
          type: "params",
          required: ["q"],
          properties: {
            q: {
              type: "string",
              description: "The search query",
              maxGraphemes: 128,
              maxLength: 640,
            },
            limit: {
              type: "integer",
              description: "The maximum number of actors to return",
              minimum: 1,
              maximum: 25,
            },
            cursor: {
              type: "string",
              description: "Cursor for pagination",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["actors"],
            properties: {
              actors: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:fm.teal.alpha.actor.defs#miniProfileView",
                },
              },
              cursor: {
                type: "string",
                description: "Cursor for pagination",
              },
            },
          },
        },
      },
    },
  },
  FmTealAlphaActorStatus: {
    lexicon: 1,
    id: "fm.teal.alpha.actor.status",
    defs: {
      main: {
        type: "record",
        description:
          "This lexicon is in a not officially released state. It is subject to change. | A declaration of the status of the actor. Only one can be shown at a time. If there are multiple, the latest record should be picked and earlier records should be deleted or tombstoned.",
        key: "literal:self",
        record: {
          type: "object",
          required: ["time", "item"],
          properties: {
            time: {
              type: "string",
              format: "datetime",
              description: "The unix timestamp of when the item was recorded",
            },
            expiry: {
              type: "string",
              format: "datetime",
              description:
                "The unix timestamp of the expiry time of the item. If unavailable, default to 10 minutes past the start time.",
            },
            item: {
              type: "ref",
              ref: "lex:fm.teal.alpha.feed.defs#playView",
            },
          },
        },
      },
    },
  },
  FmTealAlphaFeedDefs: {
    lexicon: 1,
    id: "fm.teal.alpha.feed.defs",
    description:
      "This lexicon is in a not officially released state. It is subject to change. | Misc. items related to feeds.",
    defs: {
      playView: {
        type: "object",
        required: ["trackName", "artists"],
        properties: {
          trackName: {
            type: "string",
            minLength: 1,
            maxLength: 256,
            maxGraphemes: 2560,
            description: "The name of the track",
          },
          trackMbId: {
            type: "string",
            description: "The Musicbrainz ID of the track",
          },
          recordingMbId: {
            type: "string",
            description: "The Musicbrainz recording ID of the track",
          },
          duration: {
            type: "integer",
            description: "The length of the track in seconds",
          },
          artists: {
            type: "array",
            items: {
              type: "ref",
              ref: "lex:fm.teal.alpha.feed.defs#artist",
            },
            description: "Array of artists in order of original appearance.",
          },
          releaseName: {
            type: "string",
            maxLength: 256,
            maxGraphemes: 2560,
            description: "The name of the release/album",
          },
          releaseMbId: {
            type: "string",
            description: "The Musicbrainz release ID",
          },
          isrc: {
            type: "string",
            description: "The ISRC code associated with the recording",
          },
          originUrl: {
            type: "string",
            description: "The URL associated with this track",
          },
          musicServiceBaseDomain: {
            type: "string",
            description:
              "The base domain of the music service. e.g. music.apple.com, tidal.com, spotify.com. Defaults to 'local' if not provided.",
          },
          submissionClientAgent: {
            type: "string",
            maxLength: 256,
            maxGraphemes: 2560,
            description:
              "A user-agent style string specifying the user agent. e.g. tealtracker/0.0.1b (Linux; Android 13; SM-A715F). Defaults to 'manual/unknown' if not provided.",
          },
          playedTime: {
            type: "string",
            format: "datetime",
            description: "The unix timestamp of when the track was played",
          },
        },
      },
      artist: {
        type: "object",
        required: ["artistName"],
        properties: {
          artistName: {
            type: "string",
            minLength: 1,
            maxLength: 256,
            maxGraphemes: 2560,
            description: "The name of the artist",
          },
          artistMbId: {
            type: "string",
            description: "The Musicbrainz ID of the artist",
          },
        },
      },
    },
  },
  FmTealAlphaFeedGetActorFeed: {
    lexicon: 1,
    id: "fm.teal.alpha.feed.getActorFeed",
    description:
      "This lexicon is in a not officially released state. It is subject to change. | Retrieves multiple plays from the index or via an author's DID.",
    defs: {
      main: {
        type: "query",
        parameters: {
          type: "params",
          required: ["authorDID"],
          properties: {
            authorDID: {
              type: "string",
              format: "at-identifier",
              description: "The author's DID for the play",
            },
            cursor: {
              type: "string",
              description: "The cursor to start the query from",
            },
            limit: {
              type: "integer",
              description:
                "The upper limit of tracks to get per request. Default is 20, max is 50.",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["plays"],
            properties: {
              plays: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:fm.teal.alpha.feed.defs#playView",
                },
              },
            },
          },
        },
      },
    },
  },
  FmTealAlphaFeedGetPlay: {
    lexicon: 1,
    id: "fm.teal.alpha.feed.getPlay",
    description:
      "This lexicon is in a not officially released state. It is subject to change. | Retrieves a play given an author DID and record key.",
    defs: {
      main: {
        type: "query",
        parameters: {
          type: "params",
          required: ["authorDID", "rkey"],
          properties: {
            authorDID: {
              type: "string",
              format: "at-identifier",
              description: "The author's DID for the play",
            },
            rkey: {
              type: "string",
              description: "The record key of the play",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["play"],
            properties: {
              play: {
                type: "ref",
                ref: "lex:fm.teal.alpha.feed.defs#playView",
              },
            },
          },
        },
      },
    },
  },
  FmTealAlphaFeedPlay: {
    lexicon: 1,
    id: "fm.teal.alpha.feed.play",
    description:
      "This lexicon is in a not officially released state. It is subject to change. | A declaration of a teal.fm play. Plays are submitted as a result of a user listening to a track. Plays should be marked as tracked when a user has listened to the entire track if it's under 2 minutes long, or half of the track's duration up to 4 minutes, whichever is longest.",
    defs: {
      main: {
        type: "record",
        key: "tid",
        record: {
          type: "object",
          required: ["trackName"],
          properties: {
            trackName: {
              type: "string",
              minLength: 1,
              maxLength: 256,
              maxGraphemes: 2560,
              description: "The name of the track",
            },
            trackMbId: {
              type: "string",
              description: "The Musicbrainz ID of the track",
            },
            recordingMbId: {
              type: "string",
              description: "The Musicbrainz recording ID of the track",
            },
            duration: {
              type: "integer",
              description: "The length of the track in seconds",
            },
            artistNames: {
              type: "array",
              items: {
                type: "string",
                minLength: 1,
                maxLength: 256,
                maxGraphemes: 2560,
              },
              description:
                "Array of artist names in order of original appearance. Prefer using 'artists'.",
            },
            artistMbIds: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Array of Musicbrainz artist IDs. Prefer using 'artists'.",
            },
            artists: {
              type: "array",
              items: {
                type: "ref",
                ref: "lex:fm.teal.alpha.feed.defs#artist",
              },
              description: "Array of artists in order of original appearance.",
            },
            releaseName: {
              type: "string",
              maxLength: 256,
              maxGraphemes: 2560,
              description: "The name of the release/album",
            },
            releaseMbId: {
              type: "string",
              description: "The Musicbrainz release ID",
            },
            isrc: {
              type: "string",
              description: "The ISRC code associated with the recording",
            },
            originUrl: {
              type: "string",
              description: "The URL associated with this track",
            },
            musicServiceBaseDomain: {
              type: "string",
              description:
                "The base domain of the music service. e.g. music.apple.com, tidal.com, spotify.com. Defaults to 'local' if unavailable or not provided.",
            },
            submissionClientAgent: {
              type: "string",
              maxLength: 256,
              maxGraphemes: 2560,
              description:
                "A metadata string specifying the user agent where the format is `<app-identifier>/<version> (<kernel/OS-base>; <platform/OS-version>; <device-model>)`. If string is provided, only `app-identifier` and `version` are required. `app-identifier` is recommended to be in reverse dns format. Defaults to 'manual/unknown' if unavailable or not provided.",
            },
            playedTime: {
              type: "string",
              format: "datetime",
              description: "The unix timestamp of when the track was played",
            },
          },
        },
      },
    },
  },
  AppRockskyActorDefs: {
    lexicon: 1,
    id: "app.rocksky.actor.defs",
    defs: {
      profileViewDetailed: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the actor.",
          },
          did: {
            type: "string",
            description: "The DID of the actor.",
          },
          handle: {
            type: "string",
            description: "The handle of the actor.",
          },
          displayName: {
            type: "string",
            description: "The display name of the actor.",
          },
          avatar: {
            type: "string",
            description: "The URL of the actor's avatar image.",
            format: "uri",
          },
          createdAt: {
            type: "string",
            description: "The date and time when the actor was created.",
            format: "datetime",
          },
          updatedAt: {
            type: "string",
            description: "The date and time when the actor was last updated.",
            format: "datetime",
          },
        },
      },
      profileViewBasic: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the actor.",
          },
          did: {
            type: "string",
            description: "The DID of the actor.",
          },
          handle: {
            type: "string",
            description: "The handle of the actor.",
          },
          displayName: {
            type: "string",
            description: "The display name of the actor.",
          },
          avatar: {
            type: "string",
            description: "The URL of the actor's avatar image.",
            format: "uri",
          },
          createdAt: {
            type: "string",
            description: "The date and time when the actor was created.",
            format: "datetime",
          },
          updatedAt: {
            type: "string",
            description: "The date and time when the actor was last updated.",
            format: "datetime",
          },
        },
      },
      neighbourViewBasic: {
        type: "object",
        properties: {
          userId: {
            type: "string",
          },
          did: {
            type: "string",
          },
          handle: {
            type: "string",
          },
          displayName: {
            type: "string",
          },
          avatar: {
            type: "string",
            description: "The URL of the actor's avatar image.",
            format: "uri",
          },
          sharedArtistsCount: {
            type: "integer",
            description: "The number of artists shared with the actor.",
          },
          similarityScore: {
            type: "integer",
            description: "The similarity score with the actor.",
          },
          topSharedArtistNames: {
            type: "array",
            description: "The top shared artist names with the actor.",
            items: {
              type: "string",
            },
          },
          topSharedArtistsDetails: {
            type: "array",
            description: "The top shared artist details with the actor.",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.artist.defs#artistViewBasic",
            },
          },
        },
      },
    },
  },
  AppRockskyActorGetActorAlbums: {
    lexicon: 1,
    id: "app.rocksky.actor.getActorAlbums",
    defs: {
      main: {
        type: "query",
        description: "Get albums for an actor",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              description: "The maximum number of albums to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              albums: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.album.defs#albumViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyActorGetActorArtists: {
    lexicon: 1,
    id: "app.rocksky.actor.getActorArtists",
    defs: {
      main: {
        type: "query",
        description: "Get artists for an actor",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              description: "The maximum number of albums to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              artists: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.artist.defs#artistViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyActorGetActorLovedSongs: {
    lexicon: 1,
    id: "app.rocksky.actor.getActorLovedSongs",
    defs: {
      main: {
        type: "query",
        description: "Get loved songs for an actor",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              description: "The maximum number of albums to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              tracks: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.song.defs#songViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyActorGetActorNeighbours: {
    lexicon: 1,
    id: "app.rocksky.actor.getActorNeighbours",
    defs: {
      main: {
        type: "query",
        description: "Get neighbours for an actor",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              neighbours: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.actor.defs#neighbourViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyActorGetActorPlaylists: {
    lexicon: 1,
    id: "app.rocksky.actor.getActorPlaylists",
    defs: {
      main: {
        type: "query",
        description: "Get playlists for an actor",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              description: "The maximum number of albums to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              playlists: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.playlist.defs#playlistViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyActorGetActorScrobbles: {
    lexicon: 1,
    id: "app.rocksky.actor.getActorScrobbles",
    defs: {
      main: {
        type: "query",
        description: "Get scrobbles for an actor",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              description: "The maximum number of albums to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              scrobbles: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.scrobble.defs#scrobbleViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyActorGetActorSongs: {
    lexicon: 1,
    id: "app.rocksky.actor.getActorSongs",
    defs: {
      main: {
        type: "query",
        description: "Get songs for an actor",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              description: "The maximum number of albums to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              songs: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.song.defs#songViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyActorGetProfile: {
    lexicon: 1,
    id: "app.rocksky.actor.getProfile",
    defs: {
      main: {
        type: "query",
        description: "Get the profile of an actor",
        parameters: {
          type: "params",
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.actor.defs#profileViewDetailed",
          },
        },
      },
    },
  },
  AppBskyActorProfile: {
    lexicon: 1,
    id: "app.bsky.actor.profile",
    defs: {
      main: {
        type: "record",
        description: "A declaration of a Bluesky account profile.",
        key: "literal:self",
        record: {
          type: "object",
          properties: {
            displayName: {
              type: "string",
              maxGraphemes: 64,
              maxLength: 640,
            },
            description: {
              type: "string",
              description: "Free-form profile description text.",
              maxGraphemes: 256,
              maxLength: 2560,
            },
            avatar: {
              type: "blob",
              description:
                "Small image to be displayed next to posts from account. AKA, 'profile picture'",
              accept: ["image/png", "image/jpeg"],
              maxSize: 1000000,
            },
            banner: {
              type: "blob",
              description:
                "Larger horizontal image to display behind profile view.",
              accept: ["image/png", "image/jpeg"],
              maxSize: 10000000,
            },
            labels: {
              type: "union",
              description:
                "Self-label values, specific to the Bluesky application, on the overall account.",
              refs: ["lex:com.atproto.label.defs#selfLabels"],
            },
            joinedViaStarterPack: {
              type: "ref",
              ref: "lex:com.atproto.repo.strongRef",
            },
            createdAt: {
              type: "string",
              format: "datetime",
            },
          },
        },
      },
    },
  },
  AppRockskyAlbum: {
    lexicon: 1,
    id: "app.rocksky.album",
    defs: {
      main: {
        type: "record",
        description: "A declaration of an album.",
        key: "tid",
        record: {
          type: "object",
          required: ["title", "artist", "createdAt"],
          properties: {
            title: {
              type: "string",
              description: "The title of the album.",
              minLength: 1,
              maxLength: 512,
            },
            artist: {
              type: "string",
              description: "The artist of the album.",
              minLength: 1,
              maxLength: 256,
            },
            duration: {
              type: "integer",
              description: "The duration of the album in seconds.",
            },
            releaseDate: {
              type: "string",
              description: "The release date of the album.",
              format: "datetime",
            },
            year: {
              type: "integer",
              description: "The year the album was released.",
            },
            genre: {
              type: "string",
              description: "The genre of the album.",
              maxLength: 256,
            },
            albumArt: {
              type: "blob",
              description: "The album art of the album.",
              accept: ["image/png", "image/jpeg"],
              maxSize: 2000000,
            },
            albumArtUrl: {
              type: "string",
              description: "The URL of the album art of the album.",
              format: "uri",
            },
            tags: {
              type: "array",
              description: "The tags of the album.",
              items: {
                type: "string",
                minLength: 1,
                maxLength: 256,
              },
            },
            youtubeLink: {
              type: "string",
              description: "The YouTube link of the album.",
              format: "uri",
            },
            spotifyLink: {
              type: "string",
              description: "The Spotify link of the album.",
              format: "uri",
            },
            tidalLink: {
              type: "string",
              description: "The tidal link of the album.",
              format: "uri",
            },
            appleMusicLink: {
              type: "string",
              description: "The Apple Music link of the album.",
              format: "uri",
            },
            createdAt: {
              type: "string",
              description: "The date and time when the album was created.",
              format: "datetime",
            },
          },
        },
      },
    },
  },
  AppRockskyAlbumDefs: {
    lexicon: 1,
    id: "app.rocksky.album.defs",
    defs: {
      albumViewBasic: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the album.",
          },
          uri: {
            type: "string",
            description: "The URI of the album.",
            format: "at-uri",
          },
          title: {
            type: "string",
            description: "The title of the album.",
          },
          artist: {
            type: "string",
            description: "The artist of the album.",
          },
          artistUri: {
            type: "string",
            description: "The URI of the album's artist.",
            format: "at-uri",
          },
          year: {
            type: "integer",
            description: "The year the album was released.",
          },
          albumArt: {
            type: "string",
            description: "The URL of the album art image.",
            format: "uri",
          },
          releaseDate: {
            type: "string",
            description: "The release date of the album.",
          },
          sha256: {
            type: "string",
            description: "The SHA256 hash of the album.",
          },
          playCount: {
            type: "integer",
            description: "The number of times the album has been played.",
            minimum: 0,
          },
          uniqueListeners: {
            type: "integer",
            description:
              "The number of unique listeners who have played the album.",
            minimum: 0,
          },
        },
      },
      albumViewDetailed: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the album.",
          },
          uri: {
            type: "string",
            description: "The URI of the album.",
            format: "at-uri",
          },
          title: {
            type: "string",
            description: "The title of the album.",
          },
          artist: {
            type: "string",
            description: "The artist of the album.",
          },
          artistUri: {
            type: "string",
            description: "The URI of the album's artist.",
            format: "at-uri",
          },
          year: {
            type: "integer",
            description: "The year the album was released.",
          },
          albumArt: {
            type: "string",
            description: "The URL of the album art image.",
            format: "uri",
          },
          releaseDate: {
            type: "string",
            description: "The release date of the album.",
          },
          sha256: {
            type: "string",
            description: "The SHA256 hash of the album.",
          },
          playCount: {
            type: "integer",
            description: "The number of times the album has been played.",
            minimum: 0,
          },
          uniqueListeners: {
            type: "integer",
            description:
              "The number of unique listeners who have played the album.",
            minimum: 0,
          },
          tracks: {
            type: "array",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.song.defs.songViewBasic",
            },
          },
        },
      },
    },
  },
  AppRockskyAlbumGetAlbum: {
    lexicon: 1,
    id: "app.rocksky.album.getAlbum",
    defs: {
      main: {
        type: "query",
        description: "Get detailed album view",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the album to retrieve.",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.album.defs#albumViewDetailed",
          },
        },
      },
    },
  },
  AppRockskyAlbumGetAlbums: {
    lexicon: 1,
    id: "app.rocksky.album.getAlbums",
    defs: {
      main: {
        type: "query",
        description: "Get albums",
        parameters: {
          type: "params",
          properties: {
            limit: {
              type: "integer",
              description: "The maximum number of albums to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              albums: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.album.defs#albumViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyAlbumGetAlbumTracks: {
    lexicon: 1,
    id: "app.rocksky.album.getAlbumTracks",
    defs: {
      main: {
        type: "query",
        description: "Get tracks for an album",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the album to retrieve tracks from",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              tracks: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.song.defs#songViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyApikeyCreateApikey: {
    lexicon: 1,
    id: "app.rocksky.apikey.createApikey",
    defs: {
      main: {
        type: "procedure",
        description: "Create a new API key for the authenticated user",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                type: "string",
                description: "The name of the API key.",
              },
              description: {
                type: "string",
                description: "A description for the API key.",
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.apikey.defs#apiKey",
          },
        },
      },
    },
  },
  AppRockskyApikeyDefs: {
    lexicon: 1,
    id: "app.rocksky.apikey.defs",
    defs: {
      apiKeyView: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the API key.",
          },
          name: {
            type: "string",
            description: "The name of the API key.",
          },
          description: {
            type: "string",
            description: "A description for the API key.",
          },
          createdAt: {
            type: "string",
            description: "The date and time when the API key was created.",
            format: "datetime",
          },
        },
      },
    },
  },
  AppRockskyApikeysDefs: {
    lexicon: 1,
    id: "app.rocksky.apikeys.defs",
    defs: {},
  },
  AppRockskyApikeyGetApikeys: {
    lexicon: 1,
    id: "app.rocksky.apikey.getApikeys",
    defs: {
      main: {
        type: "query",
        description: "Get a list of API keys for the authenticated user",
        parameters: {
          type: "params",
          properties: {
            offset: {
              type: "integer",
              description:
                "The number of API keys to skip before starting to collect the result set.",
            },
            limit: {
              type: "integer",
              description: "The number of API keys to return per page.",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              apiKeys: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.apikey.defs#apikeyView",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyApikeyRemoveApikey: {
    lexicon: 1,
    id: "app.rocksky.apikey.removeApikey",
    defs: {
      main: {
        type: "procedure",
        description: "Remove an API key for the authenticated user",
        parameters: {
          type: "params",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "The ID of the API key to remove.",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.apikey.defs#apiKey",
          },
        },
      },
    },
  },
  AppRockskyApikeyUpdateApikey: {
    lexicon: 1,
    id: "app.rocksky.apikey.updateApikey",
    defs: {
      main: {
        type: "procedure",
        description: "Update an existing API key for the authenticated user",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["id", "name"],
            properties: {
              id: {
                type: "string",
                description: "The ID of the API key to update.",
              },
              name: {
                type: "string",
                description: "The new name of the API key.",
              },
              description: {
                type: "string",
                description: "A new description for the API key.",
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.apikey.defs#apiKey",
          },
        },
      },
    },
  },
  AppRockskyArtist: {
    lexicon: 1,
    id: "app.rocksky.artist",
    defs: {
      main: {
        type: "record",
        description: "A declaration of an artist.",
        key: "tid",
        record: {
          type: "object",
          required: ["name", "createdAt"],
          properties: {
            name: {
              type: "string",
              description: "The name of the artist.",
              minLength: 1,
              maxLength: 512,
            },
            bio: {
              type: "string",
              description: "The biography of the artist.",
              maxLength: 1000,
            },
            picture: {
              type: "blob",
              description: "The picture of the artist.",
              accept: ["image/png", "image/jpeg"],
              maxSize: 2000000,
            },
            pictureUrl: {
              type: "string",
              description: "The URL of the picture of the artist.",
              format: "uri",
            },
            tags: {
              type: "array",
              description: "The tags of the artist.",
              items: {
                type: "string",
                minLength: 1,
                maxLength: 256,
              },
            },
            born: {
              type: "string",
              description: "The birth date of the artist.",
              format: "datetime",
            },
            died: {
              type: "string",
              description: "The death date of the artist.",
              format: "datetime",
            },
            bornIn: {
              type: "string",
              description: "The birth place of the artist.",
              maxLength: 256,
            },
            createdAt: {
              type: "string",
              description: "The date when the artist was created.",
              format: "datetime",
            },
          },
        },
      },
    },
  },
  AppRockskyArtistDefs: {
    lexicon: 1,
    id: "app.rocksky.artist.defs",
    defs: {
      artistViewBasic: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the artist.",
          },
          uri: {
            type: "string",
            description: "The URI of the artist.",
            format: "at-uri",
          },
          name: {
            type: "string",
            description: "The name of the artist.",
          },
          picture: {
            type: "string",
            description: "The picture of the artist.",
          },
          sha256: {
            type: "string",
            description: "The SHA256 hash of the artist.",
          },
          playCount: {
            type: "integer",
            description: "The number of times the artist has been played.",
            minimum: 0,
          },
          uniqueListeners: {
            type: "integer",
            description:
              "The number of unique listeners who have played the artist.",
            minimum: 0,
          },
        },
      },
      artistViewDetailed: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the artist.",
          },
          uri: {
            type: "string",
            description: "The URI of the artist.",
            format: "at-uri",
          },
          name: {
            type: "string",
            description: "The name of the artist.",
          },
          picture: {
            type: "string",
            description: "The picture of the artist.",
          },
          sha256: {
            type: "string",
            description: "The SHA256 hash of the artist.",
          },
          playCount: {
            type: "integer",
            description: "The number of times the artist has been played.",
            minimum: 0,
          },
          uniqueListeners: {
            type: "integer",
            description:
              "The number of unique listeners who have played the artist.",
            minimum: 0,
          },
        },
      },
      songViewBasic: {
        type: "object",
        properties: {
          uri: {
            type: "string",
            description: "The URI of the song.",
            format: "at-uri",
          },
          title: {
            type: "string",
            description: "The title of the song.",
          },
          playCount: {
            type: "integer",
            description: "The number of times the song has been played.",
            minimum: 0,
          },
        },
      },
      listenerViewBasic: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the actor.",
          },
          did: {
            type: "string",
            description: "The DID of the listener.",
          },
          handle: {
            type: "string",
            description: "The handle of the listener.",
          },
          displayName: {
            type: "string",
            description: "The display name of the listener.",
          },
          avatar: {
            type: "string",
            description: "The URL of the listener's avatar image.",
            format: "uri",
          },
          mostListenedSong: {
            type: "ref",
            ref: "lex:app.rocksky.artist.defs#songViewBasic",
          },
          totalPlays: {
            type: "integer",
            description: "The total number of plays by the listener.",
            minimum: 0,
          },
          rank: {
            type: "integer",
            description:
              "The rank of the listener among all listeners of the artist.",
            minimum: 1,
          },
        },
      },
      artistMbid: {
        type: "object",
        properties: {
          mbid: {
            type: "string",
            description: "The MusicBrainz Identifier (MBID) of the artist.",
          },
          name: {
            type: "string",
            description: "The name of the artist.",
            minLength: 1,
            maxLength: 256,
          },
        },
      },
    },
  },
  AppRockskyArtistGetArtist: {
    lexicon: 1,
    id: "app.rocksky.artist.getArtist",
    defs: {
      main: {
        type: "query",
        description: "Get artist details",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the artist to retrieve details from",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.artist.defs#artistViewDetailed",
          },
        },
      },
    },
  },
  AppRockskyArtistGetArtistAlbums: {
    lexicon: 1,
    id: "app.rocksky.artist.getArtistAlbums",
    defs: {
      main: {
        type: "query",
        description: "Get artist's albums",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the artist to retrieve albums from",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              albums: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.album.defs#albumViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyArtistGetArtistListeners: {
    lexicon: 1,
    id: "app.rocksky.artist.getArtistListeners",
    defs: {
      main: {
        type: "query",
        description: "Get artist listeners",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the artist to retrieve listeners from",
              format: "at-uri",
            },
            offset: {
              type: "integer",
              description: "Number of items to skip before returning results",
            },
            limit: {
              type: "integer",
              description: "Maximum number of results to return",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              listeners: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.artist.defs#listenerViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyArtistGetArtists: {
    lexicon: 1,
    id: "app.rocksky.artist.getArtists",
    defs: {
      main: {
        type: "query",
        description: "Get artists",
        parameters: {
          type: "params",
          properties: {
            limit: {
              type: "integer",
              description: "The maximum number of artists to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
            names: {
              type: "string",
              description: "The names of the artists to return",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              artists: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.artist.defs#artistViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyArtistGetArtistTracks: {
    lexicon: 1,
    id: "app.rocksky.artist.getArtistTracks",
    defs: {
      main: {
        type: "query",
        description: "Get artist's tracks",
        parameters: {
          type: "params",
          properties: {
            uri: {
              type: "string",
              description: "The URI of the artist to retrieve albums from",
              format: "at-uri",
            },
            limit: {
              type: "integer",
              description: "The maximum number of tracks to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              tracks: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.song.defs#songViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyChartsDefs: {
    lexicon: 1,
    id: "app.rocksky.charts.defs",
    defs: {
      chartsView: {
        type: "object",
        properties: {
          scrobbles: {
            type: "array",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.charts.defs#scrobbleViewBasic",
            },
          },
        },
      },
      scrobbleViewBasic: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "The date of the scrobble.",
            format: "datetime",
          },
          count: {
            type: "integer",
            description: "The number of scrobbles on this date.",
          },
        },
      },
    },
  },
  AppRockskyChartsGetScrobblesChart: {
    lexicon: 1,
    id: "app.rocksky.charts.getScrobblesChart",
    defs: {
      main: {
        type: "query",
        description: "Get the scrobbles chart",
        parameters: {
          type: "params",
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            artisturi: {
              type: "string",
              description: "The URI of the artist to filter by",
              format: "at-uri",
            },
            albumuri: {
              type: "string",
              description: "The URI of the album to filter by",
              format: "at-uri",
            },
            songuri: {
              type: "string",
              description: "The URI of the track to filter by",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.charts.defs#chartsView",
          },
        },
      },
    },
  },
  AppRockskyDropboxDefs: {
    lexicon: 1,
    id: "app.rocksky.dropbox.defs",
    defs: {
      fileView: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the file.",
          },
          name: {
            type: "string",
            description: "The name of the file.",
          },
          pathLower: {
            type: "string",
            description: "The lowercased path of the file.",
          },
          pathDisplay: {
            type: "string",
            description: "The display path of the file.",
          },
          clientModified: {
            type: "string",
            description:
              "The last modified date and time of the file on the client.",
            format: "datetime",
          },
          serverModified: {
            type: "string",
            description:
              "The last modified date and time of the file on the server.",
            format: "datetime",
          },
        },
      },
      fileListView: {
        type: "object",
        properties: {
          files: {
            type: "array",
            description: "A list of files in the Dropbox.",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.dropbox.defs#fileView",
            },
          },
        },
      },
      temporaryLinkView: {
        type: "object",
        properties: {
          link: {
            type: "string",
            description: "The temporary link to access the file.",
            format: "uri",
          },
        },
      },
    },
  },
  AppRockskyDropboxDownloadFile: {
    lexicon: 1,
    id: "app.rocksky.dropbox.downloadFile",
    defs: {
      main: {
        type: "query",
        description: "Download a file from Dropbox by its unique identifier",
        parameters: {
          type: "params",
          required: ["fileId"],
          properties: {
            fileId: {
              type: "string",
              description: "The unique identifier of the file to download",
            },
          },
        },
        output: {
          encoding: "application/octet-stream",
        },
      },
    },
  },
  AppRockskyDropboxGetFiles: {
    lexicon: 1,
    id: "app.rocksky.dropbox.getFiles",
    defs: {
      main: {
        type: "query",
        description: "Retrieve a list of files from Dropbox",
        parameters: {
          type: "params",
          properties: {
            at: {
              type: "string",
              description: "Path to the Dropbox folder or root directory",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.dropbox.defs#fileListView",
          },
        },
      },
    },
  },
  AppRockskyDropboxGetMetadata: {
    lexicon: 1,
    id: "app.rocksky.dropbox.getMetadata",
    defs: {
      main: {
        type: "query",
        description: "Retrieve metadata of a file or folder in Dropbox",
        parameters: {
          type: "params",
          required: ["path"],
          properties: {
            path: {
              type: "string",
              description: "Path to the file or folder in Dropbox",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.dropbox.defs#fileView",
          },
        },
      },
    },
  },
  AppRockskyDropboxGetTemporaryLink: {
    lexicon: 1,
    id: "app.rocksky.dropbox.getTemporaryLink",
    defs: {
      main: {
        type: "query",
        description: "Retrieve a temporary link to access a file in Dropbox",
        parameters: {
          type: "params",
          required: ["path"],
          properties: {
            path: {
              type: "string",
              description: "Path to the file in Dropbox",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.dropbox.defs#temporaryLinkView",
          },
        },
      },
    },
  },
  AppRockskyFeedDefs: {
    lexicon: 1,
    id: "app.rocksky.feed.defs",
    defs: {
      searchResultsView: {
        type: "object",
        properties: {
          hits: {
            type: "array",
            items: {
              type: "union",
              refs: [
                "lex:app.rocksky.song.defs#songViewBasic",
                "lex:app.rocksky.album.defs#albumViewBasic",
                "lex:app.rocksky.artist.defs#artistViewBasic",
                "lex:app.rocksky.playlist.defs#playlistViewBasic",
                "lex:app.rocksky.actor.defs#profileViewBasic",
              ],
            },
          },
          processingTimeMs: {
            type: "integer",
          },
          limit: {
            type: "integer",
          },
          offset: {
            type: "integer",
          },
          estimatedTotalHits: {
            type: "integer",
          },
        },
      },
      nowPlayingView: {
        type: "object",
        properties: {
          album: {
            type: "string",
          },
          albumArt: {
            type: "string",
            format: "uri",
          },
          albumArtist: {
            type: "string",
          },
          albumUri: {
            type: "string",
            format: "at-uri",
          },
          artist: {
            type: "string",
          },
          artistUri: {
            type: "string",
            format: "at-uri",
          },
          avatar: {
            type: "string",
            format: "uri",
          },
          createdAt: {
            type: "string",
          },
          did: {
            type: "string",
            format: "at-identifier",
          },
          handle: {
            type: "string",
          },
          id: {
            type: "string",
          },
          title: {
            type: "string",
          },
          trackId: {
            type: "string",
          },
          trackUri: {
            type: "string",
            format: "at-uri",
          },
          uri: {
            type: "string",
            format: "at-uri",
          },
        },
      },
      nowPlayingsView: {
        type: "object",
        properties: {
          nowPlayings: {
            type: "array",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.feed.defs#nowPlayingView",
            },
          },
        },
      },
      feedGeneratorsView: {
        type: "object",
        properties: {
          feeds: {
            type: "array",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.feed.defs#feedGeneratorView",
            },
          },
        },
      },
      feedGeneratorView: {
        type: "object",
        properties: {
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
          description: {
            type: "string",
          },
          uri: {
            type: "string",
            format: "at-uri",
          },
          avatar: {
            type: "string",
            format: "uri",
          },
          creator: {
            type: "ref",
            ref: "lex:app.rocksky.actor.defs#profileViewBasic",
          },
        },
      },
      feedUriView: {
        type: "object",
        properties: {
          uri: {
            type: "string",
            description: "The feed URI.",
            format: "at-uri",
          },
        },
      },
      feedItemView: {
        type: "object",
        properties: {
          scrobble: {
            type: "ref",
            ref: "lex:app.rocksky.scrobble.defs#scrobbleViewBasic",
          },
        },
      },
      feedView: {
        type: "object",
        properties: {
          feed: {
            type: "array",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.feed.defs#feedItemView",
            },
          },
          cursor: {
            type: "string",
            description: "The pagination cursor for the next set of results.",
          },
        },
      },
    },
  },
  AppRockskyFeedDescribeFeedGenerator: {
    lexicon: 1,
    id: "app.rocksky.feed.describeFeedGenerator",
    defs: {
      main: {
        type: "query",
        description: "Get information about a feed generator",
        parameters: {
          type: "params",
          properties: {},
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              did: {
                type: "string",
                description: "The DID of the feed generator.",
                format: "at-identifier",
              },
              feeds: {
                type: "array",
                description:
                  "List of feed URIs generated by this feed generator.",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.feed.defs#feedUriView",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyFeedGenerator: {
    lexicon: 1,
    id: "app.rocksky.feed.generator",
    defs: {
      main: {
        type: "record",
        description:
          "Record declaring of the existence of a feed generator, and containing metadata about it. The record can exist in any repository.",
        key: "tid",
        record: {
          type: "object",
          required: ["did", "displayName", "createdAt"],
          properties: {
            did: {
              type: "string",
              format: "did",
            },
            avatar: {
              type: "blob",
              accept: ["image/png", "image/jpeg"],
              maxSize: 1000000,
            },
            displayName: {
              type: "string",
              maxGraphemes: 24,
              maxLength: 240,
            },
            description: {
              type: "string",
              maxGraphemes: 300,
              maxLength: 3000,
            },
            createdAt: {
              type: "string",
              format: "datetime",
            },
          },
        },
      },
    },
  },
  AppRockskyFeedGetFeed: {
    lexicon: 1,
    id: "app.rocksky.feed.getFeed",
    defs: {
      main: {
        type: "query",
        description: "Get the feed by uri",
        parameters: {
          type: "params",
          required: ["feed"],
          properties: {
            feed: {
              type: "string",
              description: "The feed URI.",
              format: "at-uri",
            },
            limit: {
              type: "integer",
              description: "The maximum number of scrobbles to return",
              minimum: 1,
            },
            cursor: {
              type: "string",
              description: "The cursor for pagination",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.feed.defs#feedView",
          },
        },
      },
    },
  },
  AppRockskyFeedGetFeedGenerator: {
    lexicon: 1,
    id: "app.rocksky.feed.getFeedGenerator",
    defs: {
      main: {
        type: "query",
        description: "Get information about a feed generator",
        parameters: {
          type: "params",
          required: ["feed"],
          properties: {
            feed: {
              type: "string",
              description: "AT-URI of the feed generator record.",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              view: {
                type: "ref",
                ref: "lex:app.rocksky.feed.defs#feedGeneratorView",
              },
            },
          },
        },
      },
    },
  },
  AppRockskyFeedGetFeedGenerators: {
    lexicon: 1,
    id: "app.rocksky.feed.getFeedGenerators",
    defs: {
      main: {
        type: "query",
        description: "Get all feed generators",
        parameters: {
          type: "params",
          properties: {
            size: {
              type: "integer",
              description: "The maximum number of feed generators to return.",
              minimum: 1,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.feed.defs#feedGeneratorsView",
          },
        },
      },
    },
  },
  AppRockskyFeedGetFeedSkeleton: {
    lexicon: 1,
    id: "app.rocksky.feed.getFeedSkeleton",
    defs: {
      main: {
        type: "query",
        description: "Get the feed by uri",
        parameters: {
          type: "params",
          required: ["feed"],
          properties: {
            feed: {
              type: "string",
              description: "The feed URI.",
              format: "at-uri",
            },
            limit: {
              type: "integer",
              description: "The maximum number of scrobbles to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
            cursor: {
              type: "string",
              description: "The pagination cursor.",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              scrobbles: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.scrobble.defs#scrobbleViewBasic",
                },
              },
              cursor: {
                type: "string",
                description:
                  "The pagination cursor for the next set of results.",
              },
            },
          },
        },
      },
    },
  },
  AppRockskyFeedGetNowPlayings: {
    lexicon: 1,
    id: "app.rocksky.feed.getNowPlayings",
    defs: {
      main: {
        type: "query",
        description: "Get all currently playing tracks by users",
        parameters: {
          type: "params",
          properties: {
            size: {
              type: "integer",
              description:
                "The maximum number of now playing tracks to return.",
              minimum: 1,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.feed.defs#nowPlayingsView",
          },
        },
      },
    },
  },
  AppRockskyFeedSearch: {
    lexicon: 1,
    id: "app.rocksky.feed.search",
    defs: {
      main: {
        type: "query",
        description: "Search for content in the feed",
        parameters: {
          type: "params",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description: "The search query string",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.feed.defs#searchResultsView",
          },
        },
      },
    },
  },
  AppRockskyGoogledriveDefs: {
    lexicon: 1,
    id: "app.rocksky.googledrive.defs",
    defs: {
      fileView: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the file.",
          },
        },
      },
      fileListView: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.googledrive.defs#fileView",
            },
          },
        },
      },
    },
  },
  AppRockskyGoogledriveDownloadFile: {
    lexicon: 1,
    id: "app.rocksky.googledrive.downloadFile",
    defs: {
      main: {
        type: "query",
        description:
          "Download a file from Google Drive by its unique identifier",
        parameters: {
          type: "params",
          required: ["fileId"],
          properties: {
            fileId: {
              type: "string",
              description: "The unique identifier of the file to download",
            },
          },
        },
        output: {
          encoding: "application/octet-stream",
        },
      },
    },
  },
  AppRockskyGoogledriveGetFile: {
    lexicon: 1,
    id: "app.rocksky.googledrive.getFile",
    defs: {
      main: {
        type: "query",
        description: "Get a file from Google Drive by its unique identifier",
        parameters: {
          type: "params",
          required: ["fileId"],
          properties: {
            fileId: {
              type: "string",
              description: "The unique identifier of the file to retrieve",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.googledrive.defs#fileView",
          },
        },
      },
    },
  },
  AppRockskyGoogledriveGetFiles: {
    lexicon: 1,
    id: "app.rocksky.googledrive.getFiles",
    defs: {
      main: {
        type: "query",
        description: "Get a list of files from Google Drive",
        parameters: {
          type: "params",
          properties: {
            at: {
              type: "string",
              description: "Path to the Google Drive folder or root directory",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.googledrive.defs#fileListView",
          },
        },
      },
    },
  },
  AppRockskyGraphDefs: {
    lexicon: 1,
    id: "app.rocksky.graph.defs",
    defs: {
      notFoundActor: {
        type: "object",
        description: "indicates that a handle or DID could not be resolved",
        required: ["actor", "notFound"],
        properties: {
          actor: {
            type: "string",
            format: "at-identifier",
          },
          notFound: {
            type: "boolean",
          },
        },
      },
      relationship: {
        type: "object",
        required: ["did"],
        properties: {
          did: {
            type: "string",
            format: "did",
          },
          following: {
            type: "string",
            description:
              "if the actor follows this DID, this is the AT-URI of the follow record",
            format: "at-uri",
          },
          followedBy: {
            type: "string",
            description:
              "if the actor is followed by this DID, contains the AT-URI of the follow record",
            format: "at-uri",
          },
        },
      },
    },
  },
  AppRockskyGraphFollow: {
    lexicon: 1,
    id: "app.rocksky.graph.follow",
    defs: {
      main: {
        type: "record",
        description:
          "Record declaring a social 'follow' relationship of another account.",
        key: "tid",
        record: {
          type: "object",
          required: ["createdAt", "subject"],
          properties: {
            createdAt: {
              type: "string",
              format: "datetime",
            },
            subject: {
              type: "string",
              format: "did",
            },
            via: {
              type: "ref",
              ref: "lex:com.atproto.repo.strongRef",
            },
          },
        },
      },
    },
  },
  AppRockskyGraphFollowAccount: {
    lexicon: 1,
    id: "app.rocksky.graph.followAccount",
    defs: {
      main: {
        type: "procedure",
        description:
          "Creates a 'follow' relationship from the authenticated account to a specified account.",
        parameters: {
          type: "params",
          required: ["account"],
          properties: {
            account: {
              type: "string",
              format: "at-identifier",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["subject", "followers"],
            properties: {
              subject: {
                type: "ref",
                ref: "lex:app.rocksky.actor.defs#profileViewBasic",
              },
              followers: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.actor.defs#profileViewBasic",
                },
              },
              cursor: {
                type: "string",
                description:
                  "A cursor value to pass to subsequent calls to get the next page of results.",
              },
            },
          },
        },
      },
    },
  },
  AppRockskyGraphGetFollowers: {
    lexicon: 1,
    id: "app.rocksky.graph.getFollowers",
    defs: {
      main: {
        type: "query",
        description:
          "Enumerates accounts which follow a specified account (actor).",
        parameters: {
          type: "params",
          required: ["actor"],
          properties: {
            actor: {
              type: "string",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              maximum: 100,
              minimum: 1,
              default: 50,
            },
            dids: {
              type: "array",
              description:
                "If provided, filters the followers to only include those with DIDs in this list.",
              items: {
                type: "string",
                format: "did",
              },
            },
            cursor: {
              type: "string",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["subject", "followers"],
            properties: {
              subject: {
                type: "ref",
                ref: "lex:app.rocksky.actor.defs#profileViewBasic",
              },
              followers: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.actor.defs#profileViewBasic",
                },
              },
              cursor: {
                type: "string",
                description:
                  "A cursor value to pass to subsequent calls to get the next page of results.",
              },
              count: {
                type: "integer",
                description: "The total number of followers.",
              },
            },
          },
        },
      },
    },
  },
  AppRockskyGraphGetFollows: {
    lexicon: 1,
    id: "app.rocksky.graph.getFollows",
    defs: {
      main: {
        type: "query",
        description:
          "Enumerates accounts which a specified account (actor) follows.",
        parameters: {
          type: "params",
          required: ["actor"],
          properties: {
            actor: {
              type: "string",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              maximum: 100,
              minimum: 1,
              default: 50,
            },
            dids: {
              type: "array",
              description:
                "If provided, filters the follows to only include those with DIDs in this list.",
              items: {
                type: "string",
                format: "did",
              },
            },
            cursor: {
              type: "string",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["subject", "follows"],
            properties: {
              subject: {
                type: "ref",
                ref: "lex:app.rocksky.actor.defs#profileViewBasic",
              },
              follows: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.actor.defs#profileViewBasic",
                },
              },
              cursor: {
                type: "string",
                description:
                  "A cursor value to pass to subsequent calls to get the next page of results.",
              },
              count: {
                type: "integer",
                description: "The total number of follows.",
              },
            },
          },
        },
      },
    },
  },
  AppRockskyGraphGetKnownFollowers: {
    lexicon: 1,
    id: "app.rocksky.graph.getKnownFollowers",
    defs: {
      main: {
        type: "query",
        description:
          "Enumerates accounts which follow a specified account (actor) and are followed by the viewer.",
        parameters: {
          type: "params",
          required: ["actor"],
          properties: {
            actor: {
              type: "string",
              format: "at-identifier",
            },
            limit: {
              type: "integer",
              maximum: 100,
              minimum: 1,
              default: 50,
            },
            cursor: {
              type: "string",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["subject", "followers"],
            properties: {
              subject: {
                type: "ref",
                ref: "lex:app.rocksky.actor.defs#profileViewBasic",
              },
              followers: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.actor.defs#profileViewBasic",
                },
              },
              cursor: {
                type: "string",
                description:
                  "A cursor value to pass to subsequent calls to get the next page of results.",
              },
            },
          },
        },
      },
    },
  },
  AppRockskyGraphUnfollowAccount: {
    lexicon: 1,
    id: "app.rocksky.graph.unfollowAccount",
    defs: {
      main: {
        type: "procedure",
        description:
          "Removes a 'follow' relationship from the authenticated account to a specified account.",
        parameters: {
          type: "params",
          required: ["account"],
          properties: {
            account: {
              type: "string",
              format: "at-identifier",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["subject", "followers"],
            properties: {
              subject: {
                type: "ref",
                ref: "lex:app.rocksky.actor.defs#profileViewBasic",
              },
              followers: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.actor.defs#profileViewBasic",
                },
              },
              cursor: {
                type: "string",
                description:
                  "A cursor value to pass to subsequent calls to get the next page of results.",
              },
            },
          },
        },
      },
    },
  },
  AppRockskyLikeDislikeShout: {
    lexicon: 1,
    id: "app.rocksky.like.dislikeShout",
    defs: {
      main: {
        type: "procedure",
        description: "Dislike a shout",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              uri: {
                type: "string",
                description: "The unique identifier of the shout to dislike",
                format: "at-uri",
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.shout.defs#shoutView",
          },
        },
      },
    },
  },
  AppRockskyLikeDislikeSong: {
    lexicon: 1,
    id: "app.rocksky.like.dislikeSong",
    defs: {
      main: {
        type: "procedure",
        description: "Dislike a song",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              uri: {
                type: "string",
                description: "The unique identifier of the song to dislike",
                format: "at-uri",
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.song.defs#songViewDetailed",
          },
        },
      },
    },
  },
  AppRockskyLike: {
    lexicon: 1,
    id: "app.rocksky.like",
    defs: {
      main: {
        type: "record",
        description: "A declaration of a like.",
        key: "tid",
        record: {
          type: "object",
          required: ["createdAt", "subject"],
          properties: {
            createdAt: {
              type: "string",
              description: "The date when the like was created.",
              format: "datetime",
            },
            subject: {
              type: "ref",
              ref: "lex:com.atproto.repo.strongRef",
            },
          },
        },
      },
    },
  },
  AppRockskyLikeLikeShout: {
    lexicon: 1,
    id: "app.rocksky.like.likeShout",
    defs: {
      main: {
        type: "procedure",
        description: "Like a shout",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              uri: {
                type: "string",
                description: "The unique identifier of the shout to like",
                format: "at-uri",
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.shout.defs#shoutView",
          },
        },
      },
    },
  },
  AppRockskyLikeLikeSong: {
    lexicon: 1,
    id: "app.rocksky.like.likeSong",
    defs: {
      main: {
        type: "procedure",
        description: "Like a song",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              uri: {
                type: "string",
                description: "The unique identifier of the song to like",
                format: "at-uri",
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.song.defs#songViewDetailed",
          },
        },
      },
    },
  },
  AppRockskyPlayerAddDirectoryToQueue: {
    lexicon: 1,
    id: "app.rocksky.player.addDirectoryToQueue",
    defs: {
      main: {
        type: "procedure",
        description: "Add directory to the player's queue",
        parameters: {
          type: "params",
          required: ["directory"],
          properties: {
            playerId: {
              type: "string",
            },
            directory: {
              type: "string",
              description: "The directory to add to the queue",
            },
            position: {
              type: "integer",
              description:
                "Position in the queue to insert the directory at, defaults to the end if not specified",
            },
            shuffle: {
              type: "boolean",
              description:
                "Whether to shuffle the added directory in the queue",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerAddItemsToQueue: {
    lexicon: 1,
    id: "app.rocksky.player.addItemsToQueue",
    defs: {
      main: {
        type: "procedure",
        description: "Add items to the player's queue",
        parameters: {
          type: "params",
          required: ["items"],
          properties: {
            playerId: {
              type: "string",
            },
            items: {
              type: "array",
              items: {
                type: "string",
                description: "List of file identifiers to add to the queue",
              },
            },
            position: {
              type: "integer",
              description:
                "Position in the queue to insert the items at, defaults to the end if not specified",
            },
            shuffle: {
              type: "boolean",
              description: "Whether to shuffle the added items in the queue",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerDefs: {
    lexicon: 1,
    id: "app.rocksky.player.defs",
    defs: {
      currentlyPlayingViewDetailed: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the currently playing track",
          },
        },
      },
      playbackQueueViewDetailed: {
        type: "object",
        properties: {
          tracks: {
            type: "array",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.song.defs.songViewBasic",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerGetCurrentlyPlaying: {
    lexicon: 1,
    id: "app.rocksky.player.getCurrentlyPlaying",
    defs: {
      main: {
        type: "query",
        description: "Get the currently playing track",
        parameters: {
          type: "params",
          properties: {
            playerId: {
              type: "string",
            },
            actor: {
              type: "string",
              description:
                "Handle or DID of the actor to retrieve the currently playing track for. If not provided, defaults to the current user.",
              format: "at-identifier",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.player.defs#currentlyPlayingViewDetailed",
          },
        },
      },
    },
  },
  AppRockskyPlayerGetPlaybackQueue: {
    lexicon: 1,
    id: "app.rocksky.player.getPlaybackQueue",
    defs: {
      main: {
        type: "query",
        description: "Retrieve the current playback queue",
        parameters: {
          type: "params",
          properties: {
            playerId: {
              type: "string",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.player.defs#playbackQueueViewDetailed",
          },
        },
      },
    },
  },
  AppRockskyPlayerNext: {
    lexicon: 1,
    id: "app.rocksky.player.next",
    defs: {
      main: {
        type: "procedure",
        description: "Play the next track in the queue",
        parameters: {
          type: "params",
          properties: {
            playerId: {
              type: "string",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerPause: {
    lexicon: 1,
    id: "app.rocksky.player.pause",
    defs: {
      main: {
        type: "procedure",
        description: "Pause the currently playing track",
        parameters: {
          type: "params",
          properties: {
            playerId: {
              type: "string",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerPlay: {
    lexicon: 1,
    id: "app.rocksky.player.play",
    defs: {
      main: {
        type: "procedure",
        description: "Resume playback of the currently paused track",
        parameters: {
          type: "params",
          properties: {
            playerId: {
              type: "string",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerPlayDirectory: {
    lexicon: 1,
    id: "app.rocksky.player.playDirectory",
    defs: {
      main: {
        type: "procedure",
        description: "Play all tracks in a directory",
        parameters: {
          type: "params",
          required: ["directoryId"],
          properties: {
            playerId: {
              type: "string",
            },
            directoryId: {
              type: "string",
            },
            shuffle: {
              type: "boolean",
            },
            recurse: {
              type: "boolean",
            },
            position: {
              type: "integer",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerPlayFile: {
    lexicon: 1,
    id: "app.rocksky.player.playFile",
    defs: {
      main: {
        type: "procedure",
        description: "Play a specific audio file",
        parameters: {
          type: "params",
          required: ["fileId"],
          properties: {
            playerId: {
              type: "string",
            },
            fileId: {
              type: "string",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerPrevious: {
    lexicon: 1,
    id: "app.rocksky.player.previous",
    defs: {
      main: {
        type: "procedure",
        description: "Play the previous track in the queue",
        parameters: {
          type: "params",
          properties: {
            playerId: {
              type: "string",
            },
          },
        },
      },
    },
  },
  AppRockskyPlayerSeek: {
    lexicon: 1,
    id: "app.rocksky.player.seek",
    defs: {
      main: {
        type: "procedure",
        description:
          "Seek to a specific position in the currently playing track",
        parameters: {
          type: "params",
          required: ["position"],
          properties: {
            playerId: {
              type: "string",
            },
            position: {
              type: "integer",
              description: "The position in seconds to seek to",
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylistCreatePlaylist: {
    lexicon: 1,
    id: "app.rocksky.playlist.createPlaylist",
    defs: {
      main: {
        type: "procedure",
        description: "Create a new playlist",
        parameters: {
          type: "params",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description: "The name of the playlist",
            },
            description: {
              type: "string",
              description: "A brief description of the playlist",
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylistDefs: {
    lexicon: 1,
    id: "app.rocksky.playlist.defs",
    defs: {
      playlistViewDetailed: {
        type: "object",
        description:
          "Detailed view of a playlist, including its tracks and metadata",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the playlist.",
          },
          title: {
            type: "string",
            description: "The title of the playlist.",
          },
          uri: {
            type: "string",
            description: "The URI of the playlist.",
            format: "at-uri",
          },
          curatorDid: {
            type: "string",
            description: "The DID of the curator of the playlist.",
            format: "at-identifier",
          },
          curatorHandle: {
            type: "string",
            description: "The handle of the curator of the playlist.",
            format: "at-identifier",
          },
          curatorName: {
            type: "string",
            description: "The name of the curator of the playlist.",
          },
          curatorAvatarUrl: {
            type: "string",
            description: "The URL of the avatar image of the curator.",
            format: "uri",
          },
          description: {
            type: "string",
            description: "A description of the playlist.",
          },
          coverImageUrl: {
            type: "string",
            description: "The URL of the cover image for the playlist.",
            format: "uri",
          },
          createdAt: {
            type: "string",
            description: "The date and time when the playlist was created.",
            format: "datetime",
          },
          tracks: {
            type: "array",
            description: "A list of tracks in the playlist.",
            items: {
              type: "ref",
              ref: "lex:app.rocksky.song.defs#songViewBasic",
            },
          },
        },
      },
      playlistViewBasic: {
        type: "object",
        description: "Basic view of a playlist, including its metadata",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the playlist.",
          },
          title: {
            type: "string",
            description: "The title of the playlist.",
          },
          uri: {
            type: "string",
            description: "The URI of the playlist.",
            format: "at-uri",
          },
          curatorDid: {
            type: "string",
            description: "The DID of the curator of the playlist.",
            format: "at-identifier",
          },
          curatorHandle: {
            type: "string",
            description: "The handle of the curator of the playlist.",
            format: "at-identifier",
          },
          curatorName: {
            type: "string",
            description: "The name of the curator of the playlist.",
          },
          curatorAvatarUrl: {
            type: "string",
            description: "The URL of the avatar image of the curator.",
            format: "uri",
          },
          description: {
            type: "string",
            description: "A description of the playlist.",
          },
          coverImageUrl: {
            type: "string",
            description: "The URL of the cover image for the playlist.",
            format: "uri",
          },
          createdAt: {
            type: "string",
            description: "The date and time when the playlist was created.",
            format: "datetime",
          },
          trackCount: {
            type: "integer",
            description: "The number of tracks in the playlist.",
            minimum: 0,
          },
        },
      },
    },
  },
  AppRockskyPlaylistGetPlaylist: {
    lexicon: 1,
    id: "app.rocksky.playlist.getPlaylist",
    defs: {
      main: {
        type: "query",
        description: "Retrieve a playlist by its ID",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the playlist to retrieve.",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.playlist.defs#playlistViewDetailed",
          },
        },
      },
    },
  },
  AppRockskyPlaylistGetPlaylists: {
    lexicon: 1,
    id: "app.rocksky.playlist.getPlaylists",
    defs: {
      main: {
        type: "query",
        description: "Retrieve a list of playlists",
        parameters: {
          type: "params",
          properties: {
            limit: {
              type: "integer",
              description: "The maximum number of playlists to return.",
            },
            offset: {
              type: "integer",
              description:
                "The offset for pagination, used to skip a number of playlists.",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              playlists: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.playlist.defs#playlistViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylistInsertDirectory: {
    lexicon: 1,
    id: "app.rocksky.playlist.insertDirectory",
    defs: {
      main: {
        type: "procedure",
        description: "Insert a directory into a playlist",
        parameters: {
          type: "params",
          required: ["uri", "directory"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the playlist to start",
              format: "at-uri",
            },
            directory: {
              type: "string",
              description: "The directory (id) to insert into the playlist",
            },
            position: {
              type: "integer",
              description:
                "The position in the playlist to insert the directory at, if not specified, the directory will be appended",
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylistInsertFiles: {
    lexicon: 1,
    id: "app.rocksky.playlist.insertFiles",
    defs: {
      main: {
        type: "procedure",
        description: "Insert files into a playlist",
        parameters: {
          type: "params",
          required: ["uri", "files"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the playlist to start",
              format: "at-uri",
            },
            files: {
              type: "array",
              items: {
                type: "string",
                description: "List of file (id) to insert into the playlist",
              },
            },
            position: {
              type: "integer",
              description:
                "The position in the playlist to insert the files at, if not specified, files will be appended",
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylist: {
    lexicon: 1,
    id: "app.rocksky.playlist",
    defs: {
      main: {
        type: "record",
        description: "A declaration of a playlist.",
        key: "tid",
        record: {
          type: "object",
          required: ["name", "createdAt"],
          properties: {
            name: {
              type: "string",
              description: "The name of the playlist.",
              minLength: 1,
              maxLength: 512,
            },
            description: {
              type: "string",
              description: "The playlist description.",
              minLength: 1,
              maxLength: 256,
            },
            picture: {
              type: "blob",
              description: "The picture of the playlist.",
              accept: ["image/png", "image/jpeg"],
              maxSize: 2000000,
            },
            tracks: {
              type: "array",
              description: "The tracks in the playlist.",
              items: {
                type: "ref",
                ref: "lex:app.rocksky.song#record",
              },
            },
            createdAt: {
              type: "string",
              description: "The date the playlist was created.",
              format: "datetime",
            },
            spotifyLink: {
              type: "string",
              description: "The Spotify link of the playlist.",
            },
            tidalLink: {
              type: "string",
              description: "The Tidal link of the playlist.",
            },
            youtubeLink: {
              type: "string",
              description: "The YouTube link of the playlist.",
            },
            appleMusicLink: {
              type: "string",
              description: "The Apple Music link of the playlist.",
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylistRemovePlaylist: {
    lexicon: 1,
    id: "app.rocksky.playlist.removePlaylist",
    defs: {
      main: {
        type: "procedure",
        description: "Remove a playlist",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the playlist to remove",
              format: "at-uri",
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylistRemoveTrack: {
    lexicon: 1,
    id: "app.rocksky.playlist.removeTrack",
    defs: {
      main: {
        type: "procedure",
        description: "Remove a track from a playlist",
        parameters: {
          type: "params",
          required: ["uri", "position"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the playlist to remove the track from",
              format: "at-uri",
            },
            position: {
              type: "integer",
              description:
                "The position of the track to remove in the playlist",
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylistStartPlaylist: {
    lexicon: 1,
    id: "app.rocksky.playlist.startPlaylist",
    defs: {
      main: {
        type: "procedure",
        description: "Start a playlist",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the playlist to start",
              format: "at-uri",
            },
            shuffle: {
              type: "boolean",
              description: "Whether to shuffle the playlist when starting it",
            },
            position: {
              type: "integer",
              description:
                "The position in the playlist to start from, if not specified, starts from the beginning",
            },
          },
        },
      },
    },
  },
  AppRockskyRadioDefs: {
    lexicon: 1,
    id: "app.rocksky.radio.defs",
    defs: {
      radioViewBasic: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the radio.",
          },
          name: {
            type: "string",
            description: "The name of the radio.",
          },
          description: {
            type: "string",
            description: "A brief description of the radio.",
          },
          createdAt: {
            type: "string",
            description: "The date and time when the radio was created.",
            format: "datetime",
          },
        },
      },
      radioViewDetailed: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the radio.",
          },
          name: {
            type: "string",
            description: "The name of the radio.",
          },
          description: {
            type: "string",
            description: "A brief description of the radio.",
          },
          website: {
            type: "string",
            description: "The website of the radio.",
            format: "uri",
          },
          url: {
            type: "string",
            description: "The streaming URL of the radio.",
            format: "uri",
          },
          genre: {
            type: "string",
            description: "The genre of the radio.",
          },
          logo: {
            type: "string",
            description: "The logo of the radio station.",
          },
          createdAt: {
            type: "string",
            description: "The date and time when the radio was created.",
            format: "datetime",
          },
        },
      },
    },
  },
  AppRockskyRadio: {
    lexicon: 1,
    id: "app.rocksky.radio",
    defs: {
      main: {
        type: "record",
        description: "A declaration of a radio station.",
        key: "tid",
        record: {
          type: "object",
          required: ["name", "url", "createdAt"],
          properties: {
            name: {
              type: "string",
              description: "The name of the radio station.",
              minLength: 1,
              maxLength: 512,
            },
            url: {
              type: "string",
              description: "The URL of the radio station.",
              format: "uri",
            },
            description: {
              type: "string",
              description: "A description of the radio station.",
              minLength: 1,
              maxLength: 1000,
            },
            genre: {
              type: "string",
              description: "The genre of the radio station.",
              minLength: 1,
              maxLength: 256,
            },
            logo: {
              type: "blob",
              description: "The logo of the radio station.",
              accept: ["image/png", "image/jpeg"],
              maxSize: 2000000,
            },
            website: {
              type: "string",
              description: "The website of the radio station.",
              format: "uri",
            },
            createdAt: {
              type: "string",
              description: "The date when the radio station was created.",
              format: "datetime",
            },
          },
        },
      },
    },
  },
  AppRockskyScrobbleCreateScrobble: {
    lexicon: 1,
    id: "app.rocksky.scrobble.createScrobble",
    defs: {
      main: {
        type: "procedure",
        description: "Create a new scrobble",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["title", "artist"],
            properties: {
              title: {
                type: "string",
                description: "The title of the track being scrobbled",
              },
              artist: {
                type: "string",
                description: "The artist of the track being scrobbled",
              },
              album: {
                type: "string",
                description: "The album of the track being scrobbled",
              },
              duration: {
                type: "integer",
                description: "The duration of the track in seconds",
              },
              mbId: {
                type: "string",
                description: "The MusicBrainz ID of the track, if available",
              },
              albumArt: {
                type: "string",
                description: "The URL of the album art for the track",
                format: "uri",
              },
              trackNumber: {
                type: "integer",
                description: "The track number of the track in the album",
              },
              releaseDate: {
                type: "string",
                description:
                  "The release date of the track, formatted as YYYY-MM-DD",
              },
              year: {
                type: "integer",
                description: "The year the track was released",
              },
              discNumber: {
                type: "integer",
                description:
                  "The disc number of the track in the album, if applicable",
              },
              lyrics: {
                type: "string",
                description: "The lyrics of the track, if available",
              },
              composer: {
                type: "string",
                description: "The composer of the track, if available",
              },
              copyrightMessage: {
                type: "string",
                description:
                  "The copyright message for the track, if available",
              },
              label: {
                type: "string",
                description: "The record label of the track, if available",
              },
              artistPicture: {
                type: "string",
                description: "The URL of the artist's picture, if available",
                format: "uri",
              },
              spotifyLink: {
                type: "string",
                description: "The Spotify link for the track, if available",
                format: "uri",
              },
              lastfmLink: {
                type: "string",
                description: "The Last.fm link for the track, if available",
                format: "uri",
              },
              tidalLink: {
                type: "string",
                description: "The Tidal link for the track, if available",
                format: "uri",
              },
              appleMusicLink: {
                type: "string",
                description: "The Apple Music link for the track, if available",
                format: "uri",
              },
              youtubeLink: {
                type: "string",
                description: "The Youtube link for the track, if available",
                format: "uri",
              },
              deezerLink: {
                type: "string",
                description: "The Deezer link for the track, if available",
                format: "uri",
              },
              timestamp: {
                type: "integer",
                description:
                  "The timestamp of the scrobble in milliseconds since epoch",
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.scrobble.defs#scrobbleViewBasic",
          },
        },
      },
    },
  },
  AppRockskyScrobbleDefs: {
    lexicon: 1,
    id: "app.rocksky.scrobble.defs",
    defs: {
      scrobbleViewBasic: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the scrobble.",
          },
          user: {
            type: "string",
            description: "The handle of the user who created the scrobble.",
          },
          userDisplayName: {
            type: "string",
            description:
              "The display name of the user who created the scrobble.",
          },
          userAvatar: {
            type: "string",
            description: "The avatar URL of the user who created the scrobble.",
            format: "uri",
          },
          title: {
            type: "string",
            description: "The title of the scrobble.",
          },
          artist: {
            type: "string",
            description: "The artist of the song.",
          },
          artistUri: {
            type: "string",
            description: "The URI of the artist.",
            format: "at-uri",
          },
          album: {
            type: "string",
            description: "The album of the song.",
          },
          albumUri: {
            type: "string",
            description: "The URI of the album.",
            format: "at-uri",
          },
          cover: {
            type: "string",
            description: "The album art URL of the song.",
            format: "uri",
          },
          date: {
            type: "string",
            description: "The timestamp when the scrobble was created.",
            format: "datetime",
          },
          uri: {
            type: "string",
            description: "The URI of the scrobble.",
            format: "uri",
          },
          sha256: {
            type: "string",
            description: "The SHA256 hash of the scrobble data.",
          },
        },
      },
      scrobbleViewDetailed: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the scrobble.",
          },
          user: {
            type: "string",
            description: "The handle of the user who created the scrobble.",
          },
          title: {
            type: "string",
            description: "The title of the scrobble.",
          },
          artist: {
            type: "string",
            description: "The artist of the song.",
          },
          artistUri: {
            type: "string",
            description: "The URI of the artist.",
            format: "at-uri",
          },
          album: {
            type: "string",
            description: "The album of the song.",
          },
          albumUri: {
            type: "string",
            description: "The URI of the album.",
            format: "at-uri",
          },
          cover: {
            type: "string",
            description: "The album art URL of the song.",
            format: "uri",
          },
          date: {
            type: "string",
            description: "The timestamp when the scrobble was created.",
            format: "datetime",
          },
          uri: {
            type: "string",
            description: "The URI of the scrobble.",
            format: "uri",
          },
          sha256: {
            type: "string",
            description: "The SHA256 hash of the scrobble data.",
          },
          listeners: {
            type: "integer",
            description: "The number of listeners",
          },
          scrobbles: {
            type: "integer",
            description: "The number of scrobbles for this song",
          },
        },
      },
    },
  },
  AppRockskyScrobbleGetScrobble: {
    lexicon: 1,
    id: "app.rocksky.scrobble.getScrobble",
    defs: {
      main: {
        type: "query",
        description: "Get a scrobble by its unique identifier",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The unique identifier of the scrobble",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.scrobble.defs#scrobbleViewDetailed",
          },
        },
      },
    },
  },
  AppRockskyScrobbleGetScrobbles: {
    lexicon: 1,
    id: "app.rocksky.scrobble.getScrobbles",
    defs: {
      main: {
        type: "query",
        description: "Get scrobbles all scrobbles",
        parameters: {
          type: "params",
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            following: {
              type: "boolean",
              description:
                "If true, only return scrobbles from actors the viewer is following.",
            },
            limit: {
              type: "integer",
              description: "The maximum number of scrobbles to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              scrobbles: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.scrobble.defs#scrobbleViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyScrobble: {
    lexicon: 1,
    id: "app.rocksky.scrobble",
    defs: {
      main: {
        type: "record",
        description: "A declaration of a scrobble.",
        key: "tid",
        record: {
          type: "object",
          required: [
            "title",
            "artist",
            "album",
            "albumArtist",
            "duration",
            "createdAt",
          ],
          properties: {
            title: {
              type: "string",
              description: "The title of the song.",
              minLength: 1,
              maxLength: 512,
            },
            artist: {
              type: "string",
              description: "The artist of the song.",
              minLength: 1,
              maxLength: 256,
            },
            artists: {
              type: "array",
              description: "The artists of the song with MusicBrainz IDs.",
              items: {
                type: "ref",
                ref: "lex:app.rocksky.artist.defs#artistMbid",
              },
            },
            albumArtist: {
              type: "string",
              description: "The album artist of the song.",
              minLength: 1,
              maxLength: 256,
            },
            album: {
              type: "string",
              description: "The album of the song.",
              minLength: 1,
              maxLength: 256,
            },
            duration: {
              type: "integer",
              description: "The duration of the song in seconds.",
              minimum: 1,
            },
            trackNumber: {
              type: "integer",
              description: "The track number of the song in the album.",
              minimum: 1,
            },
            discNumber: {
              type: "integer",
              description: "The disc number of the song in the album.",
              minimum: 1,
            },
            releaseDate: {
              type: "string",
              description: "The release date of the song.",
              format: "datetime",
            },
            year: {
              type: "integer",
              description: "The year the song was released.",
            },
            genre: {
              type: "string",
              description: "The genre of the song.",
              maxLength: 256,
            },
            tags: {
              type: "array",
              description: "The tags of the song.",
              items: {
                type: "string",
                minLength: 1,
                maxLength: 256,
              },
            },
            composer: {
              type: "string",
              description: "The composer of the song.",
              maxLength: 256,
            },
            lyrics: {
              type: "string",
              description: "The lyrics of the song.",
              maxLength: 10000,
            },
            copyrightMessage: {
              type: "string",
              description: "The copyright message of the song.",
              maxLength: 256,
            },
            wiki: {
              type: "string",
              description: "Informations about the song",
              maxLength: 10000,
            },
            albumArt: {
              type: "blob",
              description: "The album art of the song.",
              accept: ["image/png", "image/jpeg"],
              maxSize: 2000000,
            },
            albumArtUrl: {
              type: "string",
              description: "The URL of the album art of the song.",
              format: "uri",
            },
            youtubeLink: {
              type: "string",
              description: "The YouTube link of the song.",
              format: "uri",
            },
            spotifyLink: {
              type: "string",
              description: "The Spotify link of the song.",
              format: "uri",
            },
            tidalLink: {
              type: "string",
              description: "The Tidal link of the song.",
              format: "uri",
            },
            appleMusicLink: {
              type: "string",
              description: "The Apple Music link of the song.",
              format: "uri",
            },
            createdAt: {
              type: "string",
              description: "The date when the song was created.",
              format: "datetime",
            },
            mbid: {
              type: "string",
              description: "The MusicBrainz ID of the song.",
            },
            label: {
              type: "string",
              description: "The label of the song.",
              maxLength: 256,
            },
          },
        },
      },
    },
  },
  AppRockskyShoutCreateShout: {
    lexicon: 1,
    id: "app.rocksky.shout.createShout",
    defs: {
      main: {
        type: "procedure",
        description: "Create a new shout",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The content of the shout",
                minLength: 1,
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.shout.defs#shoutView",
          },
        },
      },
    },
  },
  AppRockskyShoutDefs: {
    lexicon: 1,
    id: "app.rocksky.shout.defs",
    defs: {
      author: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the author.",
          },
          did: {
            type: "string",
            description: "The decentralized identifier (DID) of the author.",
            format: "at-identifier",
          },
          handle: {
            type: "string",
            description: "The handle of the author.",
            format: "at-identifier",
          },
          displayName: {
            type: "string",
            description: "The display name of the author.",
          },
          avatar: {
            type: "string",
            description: "The URL of the author's avatar image.",
            format: "uri",
          },
        },
      },
      shoutView: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the shout.",
          },
          message: {
            type: "string",
            description: "The content of the shout.",
          },
          parent: {
            type: "string",
            description:
              "The ID of the parent shout if this is a reply, otherwise null.",
          },
          createdAt: {
            type: "string",
            description: "The date and time when the shout was created.",
            format: "datetime",
          },
          author: {
            type: "ref",
            description: "The author of the shout.",
            ref: "lex:app.rocksky.shout.defs#author",
          },
        },
      },
    },
  },
  AppRockskyShoutGetAlbumShouts: {
    lexicon: 1,
    id: "app.rocksky.shout.getAlbumShouts",
    defs: {
      main: {
        type: "query",
        description: "Get shouts for an album",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description:
                "The unique identifier of the album to retrieve shouts for",
              format: "at-uri",
            },
            limit: {
              type: "integer",
              description: "The maximum number of shouts to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description:
                "The number of shouts to skip before starting to collect the result set",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              shouts: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.shout.defs#shoutViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyShoutGetArtistShouts: {
    lexicon: 1,
    id: "app.rocksky.shout.getArtistShouts",
    defs: {
      main: {
        type: "query",
        description: "Get shouts for an artist",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the artist to retrieve shouts for",
              format: "at-uri",
            },
            limit: {
              type: "integer",
              description: "The maximum number of shouts to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description:
                "The number of shouts to skip before starting to collect the result set",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              shouts: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.shout.defs#shoutViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyShoutGetProfileShouts: {
    lexicon: 1,
    id: "app.rocksky.shout.getProfileShouts",
    defs: {
      main: {
        type: "query",
        description: "Get the shouts of an actor's profile",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the actor",
              format: "at-identifier",
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
            limit: {
              type: "integer",
              description: "The maximum number of shouts to return",
              minimum: 1,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              shouts: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.shout.defs#shoutViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyShoutGetShoutReplies: {
    lexicon: 1,
    id: "app.rocksky.shout.getShoutReplies",
    defs: {
      main: {
        type: "query",
        description: "Get replies to a shout",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the shout to retrieve replies for",
              format: "at-uri",
            },
            limit: {
              type: "integer",
              description: "The maximum number of shouts to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description:
                "The number of shouts to skip before starting to collect the result set",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              shouts: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.shout.defs#shoutViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyShoutGetTrackShouts: {
    lexicon: 1,
    id: "app.rocksky.shout.getTrackShouts",
    defs: {
      main: {
        type: "query",
        description: "Get all shouts for a specific track",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The URI of the track to retrieve shouts for",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              shouts: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.shout.defs#shoutViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskyShoutRemoveShout: {
    lexicon: 1,
    id: "app.rocksky.shout.removeShout",
    defs: {
      main: {
        type: "procedure",
        description: "Remove a shout by its ID",
        parameters: {
          type: "params",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "The ID of the shout to be removed",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.shout.defs#shoutView",
          },
        },
      },
    },
  },
  AppRockskyShoutReplyShout: {
    lexicon: 1,
    id: "app.rocksky.shout.replyShout",
    defs: {
      main: {
        type: "procedure",
        description: "Reply to a shout",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["shoutId", "message"],
            properties: {
              shoutId: {
                type: "string",
                description: "The unique identifier of the shout to reply to",
              },
              message: {
                type: "string",
                description: "The content of the reply",
                minLength: 1,
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.shout.defs#shoutView",
          },
        },
      },
    },
  },
  AppRockskyShoutReportShout: {
    lexicon: 1,
    id: "app.rocksky.shout.reportShout",
    defs: {
      main: {
        type: "procedure",
        description: "Report a shout for moderation",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["shoutId"],
            properties: {
              shoutId: {
                type: "string",
                description: "The unique identifier of the shout to report",
              },
              reason: {
                type: "string",
                description: "The reason for reporting the shout",
                minLength: 1,
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.shout.defs#shoutView",
          },
        },
      },
    },
  },
  AppRockskyShout: {
    lexicon: 1,
    id: "app.rocksky.shout",
    defs: {
      main: {
        type: "record",
        description: "A declaration of a shout.",
        key: "tid",
        record: {
          type: "object",
          required: ["message", "createdAt", "subject"],
          properties: {
            message: {
              type: "string",
              description: "The message of the shout.",
              minLength: 1,
              maxLength: 1000,
            },
            createdAt: {
              type: "string",
              description: "The date when the shout was created.",
              format: "datetime",
            },
            parent: {
              type: "ref",
              ref: "lex:com.atproto.repo.strongRef",
            },
            subject: {
              type: "ref",
              ref: "lex:com.atproto.repo.strongRef",
            },
          },
        },
      },
    },
  },
  AppRockskySongCreateSong: {
    lexicon: 1,
    id: "app.rocksky.song.createSong",
    defs: {
      main: {
        type: "procedure",
        description: "Create a new song",
        input: {
          encoding: "application/json",
          schema: {
            type: "object",
            required: ["title", "artist", "album", "albumArtist"],
            properties: {
              title: {
                type: "string",
                description: "The title of the song",
              },
              artist: {
                type: "string",
                description: "The artist of the song",
              },
              albumArtist: {
                type: "string",
                description:
                  "The album artist of the song, if different from the main artist",
              },
              album: {
                type: "string",
                description: "The album of the song, if applicable",
              },
              duration: {
                type: "integer",
                description: "The duration of the song in seconds",
              },
              mbId: {
                type: "string",
                description: "The MusicBrainz ID of the song, if available",
              },
              albumArt: {
                type: "string",
                description: "The URL of the album art for the song",
                format: "uri",
              },
              trackNumber: {
                type: "integer",
                description:
                  "The track number of the song in the album, if applicable",
              },
              releaseDate: {
                type: "string",
                description:
                  "The release date of the song, formatted as YYYY-MM-DD",
              },
              year: {
                type: "integer",
                description: "The year the song was released",
              },
              discNumber: {
                type: "integer",
                description:
                  "The disc number of the song in the album, if applicable",
              },
              lyrics: {
                type: "string",
                description: "The lyrics of the song, if available",
              },
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.song.defs#songViewDetailed",
          },
        },
      },
    },
  },
  AppRockskySongDefs: {
    lexicon: 1,
    id: "app.rocksky.song.defs",
    defs: {
      songViewBasic: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the song.",
          },
          title: {
            type: "string",
            description: "The title of the song.",
          },
          artist: {
            type: "string",
            description: "The artist of the song.",
          },
          albumArtist: {
            type: "string",
            description: "The artist of the album the song belongs to.",
          },
          albumArt: {
            type: "string",
            description: "The URL of the album art image.",
            format: "uri",
          },
          uri: {
            type: "string",
            description: "The URI of the song.",
            format: "at-uri",
          },
          album: {
            type: "string",
            description: "The album of the song.",
          },
          duration: {
            type: "integer",
            description: "The duration of the song in milliseconds.",
          },
          trackNumber: {
            type: "integer",
            description: "The track number of the song in the album.",
          },
          discNumber: {
            type: "integer",
            description: "The disc number of the song in the album.",
          },
          playCount: {
            type: "integer",
            description: "The number of times the song has been played.",
            minimum: 0,
          },
          uniqueListeners: {
            type: "integer",
            description:
              "The number of unique listeners who have played the song.",
            minimum: 0,
          },
          albumUri: {
            type: "string",
            description: "The URI of the album the song belongs to.",
            format: "at-uri",
          },
          artistUri: {
            type: "string",
            description: "The URI of the artist of the song.",
            format: "at-uri",
          },
          sha256: {
            type: "string",
            description: "The SHA256 hash of the song.",
          },
          createdAt: {
            type: "string",
            description: "The timestamp when the song was created.",
            format: "datetime",
          },
        },
      },
      songViewDetailed: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the song.",
          },
          title: {
            type: "string",
            description: "The title of the song.",
          },
          artist: {
            type: "string",
            description: "The artist of the song.",
          },
          albumArtist: {
            type: "string",
            description: "The artist of the album the song belongs to.",
          },
          albumArt: {
            type: "string",
            description: "The URL of the album art image.",
            format: "uri",
          },
          uri: {
            type: "string",
            description: "The URI of the song.",
            format: "at-uri",
          },
          album: {
            type: "string",
            description: "The album of the song.",
          },
          duration: {
            type: "integer",
            description: "The duration of the song in milliseconds.",
          },
          trackNumber: {
            type: "integer",
            description: "The track number of the song in the album.",
          },
          discNumber: {
            type: "integer",
            description: "The disc number of the song in the album.",
          },
          playCount: {
            type: "integer",
            description: "The number of times the song has been played.",
            minimum: 0,
          },
          uniqueListeners: {
            type: "integer",
            description:
              "The number of unique listeners who have played the song.",
            minimum: 0,
          },
          albumUri: {
            type: "string",
            description: "The URI of the album the song belongs to.",
            format: "at-uri",
          },
          artistUri: {
            type: "string",
            description: "The URI of the artist of the song.",
            format: "at-uri",
          },
          sha256: {
            type: "string",
            description: "The SHA256 hash of the song.",
          },
          createdAt: {
            type: "string",
            description: "The timestamp when the song was created.",
            format: "datetime",
          },
        },
      },
    },
  },
  AppRockskySongGetSong: {
    lexicon: 1,
    id: "app.rocksky.song.getSong",
    defs: {
      main: {
        type: "query",
        description: "Get a song by its uri",
        parameters: {
          type: "params",
          required: ["uri"],
          properties: {
            uri: {
              type: "string",
              description: "The unique identifier of the song to retrieve",
              format: "at-uri",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.song.defs#songViewDetailed",
          },
        },
      },
    },
  },
  AppRockskySongGetSongs: {
    lexicon: 1,
    id: "app.rocksky.song.getSongs",
    defs: {
      main: {
        type: "query",
        description: "Get songs",
        parameters: {
          type: "params",
          properties: {
            limit: {
              type: "integer",
              description: "The maximum number of songs to return",
              minimum: 1,
            },
            offset: {
              type: "integer",
              description: "The offset for pagination",
              minimum: 0,
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "object",
            properties: {
              songs: {
                type: "array",
                items: {
                  type: "ref",
                  ref: "lex:app.rocksky.song.defs#songViewBasic",
                },
              },
            },
          },
        },
      },
    },
  },
  AppRockskySong: {
    lexicon: 1,
    id: "app.rocksky.song",
    defs: {
      main: {
        type: "record",
        description: "A declaration of a song.",
        key: "tid",
        record: {
          type: "object",
          required: [
            "title",
            "artist",
            "album",
            "albumArtist",
            "duration",
            "createdAt",
          ],
          properties: {
            title: {
              type: "string",
              description: "The title of the song.",
              minLength: 1,
              maxLength: 512,
            },
            artist: {
              type: "string",
              description: "The artist of the song.",
              minLength: 1,
              maxLength: 256,
            },
            artists: {
              type: "array",
              description: "The artists of the song with MusicBrainz IDs.",
              items: {
                type: "ref",
                ref: "lex:app.rocksky.artist.defs#artistMbid",
              },
            },
            albumArtist: {
              type: "string",
              description: "The album artist of the song.",
              minLength: 1,
              maxLength: 256,
            },
            album: {
              type: "string",
              description: "The album of the song.",
              minLength: 1,
              maxLength: 256,
            },
            duration: {
              type: "integer",
              description: "The duration of the song in seconds.",
              minimum: 1,
            },
            trackNumber: {
              type: "integer",
              description: "The track number of the song in the album.",
              minimum: 1,
            },
            discNumber: {
              type: "integer",
              description: "The disc number of the song in the album.",
              minimum: 1,
            },
            releaseDate: {
              type: "string",
              description: "The release date of the song.",
              format: "datetime",
            },
            year: {
              type: "integer",
              description: "The year the song was released.",
            },
            genre: {
              type: "string",
              description: "The genre of the song.",
              minLength: 1,
              maxLength: 256,
            },
            tags: {
              type: "array",
              description: "The tags of the song.",
              items: {
                type: "string",
                minLength: 1,
                maxLength: 256,
              },
            },
            composer: {
              type: "string",
              description: "The composer of the song.",
              maxLength: 256,
            },
            lyrics: {
              type: "string",
              description: "The lyrics of the song.",
              maxLength: 10000,
            },
            copyrightMessage: {
              type: "string",
              description: "The copyright message of the song.",
              maxLength: 256,
            },
            wiki: {
              type: "string",
              description: "Informations about the song",
              maxLength: 10000,
            },
            albumArt: {
              type: "blob",
              description: "The album art of the song.",
              accept: ["image/png", "image/jpeg"],
              maxSize: 2000000,
            },
            albumArtUrl: {
              type: "string",
              description: "The URL of the album art of the song.",
              format: "uri",
            },
            youtubeLink: {
              type: "string",
              description: "The YouTube link of the song.",
              format: "uri",
            },
            spotifyLink: {
              type: "string",
              description: "The Spotify link of the song.",
              format: "uri",
            },
            tidalLink: {
              type: "string",
              description: "The Tidal link of the song.",
              format: "uri",
            },
            appleMusicLink: {
              type: "string",
              description: "The Apple Music link of the song.",
              format: "uri",
            },
            createdAt: {
              type: "string",
              description: "The date when the song was created.",
              format: "datetime",
            },
            mbid: {
              type: "string",
              description: "The MusicBrainz ID of the song.",
            },
            label: {
              type: "string",
              description: "The label of the song.",
              maxLength: 256,
            },
          },
        },
      },
    },
  },
  AppRockskySpotifyDefs: {
    lexicon: 1,
    id: "app.rocksky.spotify.defs",
    defs: {
      spotifyTrackView: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The unique identifier of the Spotify track.",
          },
          name: {
            type: "string",
            description: "The name of the track.",
          },
          artist: {
            type: "string",
            description: "The name of the artist.",
          },
          album: {
            type: "string",
            description: "The name of the album.",
          },
          duration: {
            type: "integer",
            description: "The duration of the track in milliseconds.",
          },
          previewUrl: {
            type: "string",
            description: "A URL to a preview of the track.",
          },
        },
      },
    },
  },
  AppRockskySpotifyGetCurrentlyPlaying: {
    lexicon: 1,
    id: "app.rocksky.spotify.getCurrentlyPlaying",
    defs: {
      main: {
        type: "query",
        description: "Get the currently playing track",
        parameters: {
          type: "params",
          properties: {
            actor: {
              type: "string",
              description:
                "Handle or DID of the actor to retrieve the currently playing track for. If not provided, defaults to the current user.",
              format: "at-identifier",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.player.defs#currentlyPlayingViewDetailed",
          },
        },
      },
    },
  },
  AppRockskySpotifyNext: {
    lexicon: 1,
    id: "app.rocksky.spotify.next",
    defs: {
      main: {
        type: "procedure",
        description: "Play the next track in the queue",
      },
    },
  },
  AppRockskySpotifyPause: {
    lexicon: 1,
    id: "app.rocksky.spotify.pause",
    defs: {
      main: {
        type: "procedure",
        description: "Pause the currently playing track",
      },
    },
  },
  AppRockskySpotifyPlay: {
    lexicon: 1,
    id: "app.rocksky.spotify.play",
    defs: {
      main: {
        type: "procedure",
        description: "Resume playback of the currently paused track",
      },
    },
  },
  AppRockskySpotifyPrevious: {
    lexicon: 1,
    id: "app.rocksky.spotify.previous",
    defs: {
      main: {
        type: "procedure",
        description: "Play the previous track in the queue",
      },
    },
  },
  AppRockskySpotifySeek: {
    lexicon: 1,
    id: "app.rocksky.spotify.seek",
    defs: {
      main: {
        type: "procedure",
        description:
          "Seek to a specific position in the currently playing track",
        parameters: {
          type: "params",
          required: ["position"],
          properties: {
            position: {
              type: "integer",
              description: "The position in seconds to seek to",
            },
          },
        },
      },
    },
  },
  AppRockskyStatsDefs: {
    lexicon: 1,
    id: "app.rocksky.stats.defs",
    defs: {
      statsView: {
        type: "object",
        properties: {
          scrobbles: {
            type: "integer",
            description: "The total number of scrobbles.",
          },
          artists: {
            type: "integer",
            description: "The total number of unique artists scrobbled.",
          },
          lovedTracks: {
            type: "integer",
            description: "The total number of tracks marked as loved.",
          },
          albums: {
            type: "integer",
            description: "The total number of unique albums scrobbled.",
          },
          tracks: {
            type: "integer",
            description: "The total number of unique tracks scrobbled.",
          },
        },
      },
    },
  },
  AppRockskyStatsGetStats: {
    lexicon: 1,
    id: "app.rocksky.stats.getStats",
    defs: {
      main: {
        type: "query",
        parameters: {
          type: "params",
          required: ["did"],
          properties: {
            did: {
              type: "string",
              description: "The DID or handle of the user to get stats for.",
              format: "at-identifier",
            },
          },
        },
        output: {
          encoding: "application/json",
          schema: {
            type: "ref",
            ref: "lex:app.rocksky.stats.defs#statsView",
          },
        },
      },
    },
  },
  ComAtprotoRepoStrongRef: {
    lexicon: 1,
    id: "com.atproto.repo.strongRef",
    description: "A URI with a content-hash fingerprint.",
    defs: {
      main: {
        type: "object",
        required: ["uri", "cid"],
        properties: {
          uri: {
            type: "string",
            format: "at-uri",
          },
          cid: {
            type: "string",
            format: "cid",
          },
        },
      },
    },
  },
} as const satisfies Record<string, LexiconDoc>;

export const schemas = Object.values(schemaDict);
export const lexicons: Lexicons = new Lexicons(schemas);
export const ids = {
  FmTealAlphaActorDefs: "fm.teal.alpha.actor.defs",
  FmTealAlphaActorGetProfile: "fm.teal.alpha.actor.getProfile",
  FmTealAlphaActorGetProfiles: "fm.teal.alpha.actor.getProfiles",
  FmTealAlphaActorProfile: "fm.teal.alpha.actor.profile",
  FmTealAlphaActorSearchActors: "fm.teal.alpha.actor.searchActors",
  FmTealAlphaActorStatus: "fm.teal.alpha.actor.status",
  FmTealAlphaFeedDefs: "fm.teal.alpha.feed.defs",
  FmTealAlphaFeedGetActorFeed: "fm.teal.alpha.feed.getActorFeed",
  FmTealAlphaFeedGetPlay: "fm.teal.alpha.feed.getPlay",
  FmTealAlphaFeedPlay: "fm.teal.alpha.feed.play",
  AppRockskyActorDefs: "app.rocksky.actor.defs",
  AppRockskyActorGetActorAlbums: "app.rocksky.actor.getActorAlbums",
  AppRockskyActorGetActorArtists: "app.rocksky.actor.getActorArtists",
  AppRockskyActorGetActorLovedSongs: "app.rocksky.actor.getActorLovedSongs",
  AppRockskyActorGetActorNeighbours: "app.rocksky.actor.getActorNeighbours",
  AppRockskyActorGetActorPlaylists: "app.rocksky.actor.getActorPlaylists",
  AppRockskyActorGetActorScrobbles: "app.rocksky.actor.getActorScrobbles",
  AppRockskyActorGetActorSongs: "app.rocksky.actor.getActorSongs",
  AppRockskyActorGetProfile: "app.rocksky.actor.getProfile",
  AppBskyActorProfile: "app.bsky.actor.profile",
  AppRockskyAlbum: "app.rocksky.album",
  AppRockskyAlbumDefs: "app.rocksky.album.defs",
  AppRockskyAlbumGetAlbum: "app.rocksky.album.getAlbum",
  AppRockskyAlbumGetAlbums: "app.rocksky.album.getAlbums",
  AppRockskyAlbumGetAlbumTracks: "app.rocksky.album.getAlbumTracks",
  AppRockskyApikeyCreateApikey: "app.rocksky.apikey.createApikey",
  AppRockskyApikeyDefs: "app.rocksky.apikey.defs",
  AppRockskyApikeysDefs: "app.rocksky.apikeys.defs",
  AppRockskyApikeyGetApikeys: "app.rocksky.apikey.getApikeys",
  AppRockskyApikeyRemoveApikey: "app.rocksky.apikey.removeApikey",
  AppRockskyApikeyUpdateApikey: "app.rocksky.apikey.updateApikey",
  AppRockskyArtist: "app.rocksky.artist",
  AppRockskyArtistDefs: "app.rocksky.artist.defs",
  AppRockskyArtistGetArtist: "app.rocksky.artist.getArtist",
  AppRockskyArtistGetArtistAlbums: "app.rocksky.artist.getArtistAlbums",
  AppRockskyArtistGetArtistListeners: "app.rocksky.artist.getArtistListeners",
  AppRockskyArtistGetArtists: "app.rocksky.artist.getArtists",
  AppRockskyArtistGetArtistTracks: "app.rocksky.artist.getArtistTracks",
  AppRockskyChartsDefs: "app.rocksky.charts.defs",
  AppRockskyChartsGetScrobblesChart: "app.rocksky.charts.getScrobblesChart",
  AppRockskyDropboxDefs: "app.rocksky.dropbox.defs",
  AppRockskyDropboxDownloadFile: "app.rocksky.dropbox.downloadFile",
  AppRockskyDropboxGetFiles: "app.rocksky.dropbox.getFiles",
  AppRockskyDropboxGetMetadata: "app.rocksky.dropbox.getMetadata",
  AppRockskyDropboxGetTemporaryLink: "app.rocksky.dropbox.getTemporaryLink",
  AppRockskyFeedDefs: "app.rocksky.feed.defs",
  AppRockskyFeedDescribeFeedGenerator: "app.rocksky.feed.describeFeedGenerator",
  AppRockskyFeedGenerator: "app.rocksky.feed.generator",
  AppRockskyFeedGetFeed: "app.rocksky.feed.getFeed",
  AppRockskyFeedGetFeedGenerator: "app.rocksky.feed.getFeedGenerator",
  AppRockskyFeedGetFeedGenerators: "app.rocksky.feed.getFeedGenerators",
  AppRockskyFeedGetFeedSkeleton: "app.rocksky.feed.getFeedSkeleton",
  AppRockskyFeedGetNowPlayings: "app.rocksky.feed.getNowPlayings",
  AppRockskyFeedSearch: "app.rocksky.feed.search",
  AppRockskyGoogledriveDefs: "app.rocksky.googledrive.defs",
  AppRockskyGoogledriveDownloadFile: "app.rocksky.googledrive.downloadFile",
  AppRockskyGoogledriveGetFile: "app.rocksky.googledrive.getFile",
  AppRockskyGoogledriveGetFiles: "app.rocksky.googledrive.getFiles",
  AppRockskyGraphDefs: "app.rocksky.graph.defs",
  AppRockskyGraphFollow: "app.rocksky.graph.follow",
  AppRockskyGraphFollowAccount: "app.rocksky.graph.followAccount",
  AppRockskyGraphGetFollowers: "app.rocksky.graph.getFollowers",
  AppRockskyGraphGetFollows: "app.rocksky.graph.getFollows",
  AppRockskyGraphGetKnownFollowers: "app.rocksky.graph.getKnownFollowers",
  AppRockskyGraphUnfollowAccount: "app.rocksky.graph.unfollowAccount",
  AppRockskyLikeDislikeShout: "app.rocksky.like.dislikeShout",
  AppRockskyLikeDislikeSong: "app.rocksky.like.dislikeSong",
  AppRockskyLike: "app.rocksky.like",
  AppRockskyLikeLikeShout: "app.rocksky.like.likeShout",
  AppRockskyLikeLikeSong: "app.rocksky.like.likeSong",
  AppRockskyPlayerAddDirectoryToQueue: "app.rocksky.player.addDirectoryToQueue",
  AppRockskyPlayerAddItemsToQueue: "app.rocksky.player.addItemsToQueue",
  AppRockskyPlayerDefs: "app.rocksky.player.defs",
  AppRockskyPlayerGetCurrentlyPlaying: "app.rocksky.player.getCurrentlyPlaying",
  AppRockskyPlayerGetPlaybackQueue: "app.rocksky.player.getPlaybackQueue",
  AppRockskyPlayerNext: "app.rocksky.player.next",
  AppRockskyPlayerPause: "app.rocksky.player.pause",
  AppRockskyPlayerPlay: "app.rocksky.player.play",
  AppRockskyPlayerPlayDirectory: "app.rocksky.player.playDirectory",
  AppRockskyPlayerPlayFile: "app.rocksky.player.playFile",
  AppRockskyPlayerPrevious: "app.rocksky.player.previous",
  AppRockskyPlayerSeek: "app.rocksky.player.seek",
  AppRockskyPlaylistCreatePlaylist: "app.rocksky.playlist.createPlaylist",
  AppRockskyPlaylistDefs: "app.rocksky.playlist.defs",
  AppRockskyPlaylistGetPlaylist: "app.rocksky.playlist.getPlaylist",
  AppRockskyPlaylistGetPlaylists: "app.rocksky.playlist.getPlaylists",
  AppRockskyPlaylistInsertDirectory: "app.rocksky.playlist.insertDirectory",
  AppRockskyPlaylistInsertFiles: "app.rocksky.playlist.insertFiles",
  AppRockskyPlaylist: "app.rocksky.playlist",
  AppRockskyPlaylistRemovePlaylist: "app.rocksky.playlist.removePlaylist",
  AppRockskyPlaylistRemoveTrack: "app.rocksky.playlist.removeTrack",
  AppRockskyPlaylistStartPlaylist: "app.rocksky.playlist.startPlaylist",
  AppRockskyRadioDefs: "app.rocksky.radio.defs",
  AppRockskyRadio: "app.rocksky.radio",
  AppRockskyScrobbleCreateScrobble: "app.rocksky.scrobble.createScrobble",
  AppRockskyScrobbleDefs: "app.rocksky.scrobble.defs",
  AppRockskyScrobbleGetScrobble: "app.rocksky.scrobble.getScrobble",
  AppRockskyScrobbleGetScrobbles: "app.rocksky.scrobble.getScrobbles",
  AppRockskyScrobble: "app.rocksky.scrobble",
  AppRockskyShoutCreateShout: "app.rocksky.shout.createShout",
  AppRockskyShoutDefs: "app.rocksky.shout.defs",
  AppRockskyShoutGetAlbumShouts: "app.rocksky.shout.getAlbumShouts",
  AppRockskyShoutGetArtistShouts: "app.rocksky.shout.getArtistShouts",
  AppRockskyShoutGetProfileShouts: "app.rocksky.shout.getProfileShouts",
  AppRockskyShoutGetShoutReplies: "app.rocksky.shout.getShoutReplies",
  AppRockskyShoutGetTrackShouts: "app.rocksky.shout.getTrackShouts",
  AppRockskyShoutRemoveShout: "app.rocksky.shout.removeShout",
  AppRockskyShoutReplyShout: "app.rocksky.shout.replyShout",
  AppRockskyShoutReportShout: "app.rocksky.shout.reportShout",
  AppRockskyShout: "app.rocksky.shout",
  AppRockskySongCreateSong: "app.rocksky.song.createSong",
  AppRockskySongDefs: "app.rocksky.song.defs",
  AppRockskySongGetSong: "app.rocksky.song.getSong",
  AppRockskySongGetSongs: "app.rocksky.song.getSongs",
  AppRockskySong: "app.rocksky.song",
  AppRockskySpotifyDefs: "app.rocksky.spotify.defs",
  AppRockskySpotifyGetCurrentlyPlaying:
    "app.rocksky.spotify.getCurrentlyPlaying",
  AppRockskySpotifyNext: "app.rocksky.spotify.next",
  AppRockskySpotifyPause: "app.rocksky.spotify.pause",
  AppRockskySpotifyPlay: "app.rocksky.spotify.play",
  AppRockskySpotifyPrevious: "app.rocksky.spotify.previous",
  AppRockskySpotifySeek: "app.rocksky.spotify.seek",
  AppRockskyStatsDefs: "app.rocksky.stats.defs",
  AppRockskyStatsGetStats: "app.rocksky.stats.getStats",
  ComAtprotoRepoStrongRef: "com.atproto.repo.strongRef",
};
