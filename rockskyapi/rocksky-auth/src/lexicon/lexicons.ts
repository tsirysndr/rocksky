/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { LexiconDoc, Lexicons } from '@atproto/lexicon'

export const schemaDict = {
  AppRockskyAlbum: {
    lexicon: 1,
    id: 'app.rocksky.album',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of an album.',
        record: {
          type: 'object',
          required: ['title', 'artist', 'createdAt'],
          properties: {
            title: {
              type: 'string',
              description: 'The title of the album.',
              minLength: 1,
              maxLength: 512,
            },
            artist: {
              type: 'string',
              description: 'The artist of the album.',
              minLength: 1,
              maxLength: 256,
            },
            duration: {
              type: 'integer',
              description: 'The duration of the album in seconds.',
            },
            releaseDate: {
              type: 'string',
              description: 'The release date of the album.',
              format: 'datetime',
            },
            year: {
              type: 'integer',
              description: 'The year the album was released.',
            },
            genre: {
              type: 'string',
              description: 'The genre of the album.',
              maxLength: 256,
            },
            albumArt: {
              type: 'blob',
              description: 'The album art of the album.',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 2000000,
            },
            tags: {
              type: 'array',
              description: 'The tags of the album.',
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 256,
              },
            },
            tracks: {
              type: 'array',
              description: 'The tracks in the album.',
              items: {
                type: 'ref',
                ref: 'lex:app.rocksky.song#record',
              },
            },
            youtubeLink: {
              type: 'string',
              description: 'The YouTube link of the album.',
              format: 'uri',
            },
            spotifyLink: {
              type: 'string',
              description: 'The Spotify link of the album.',
              format: 'uri',
            },
            tidalLink: {
              type: 'string',
              description: 'The Tidal link of the album.',
              format: 'uri',
            },
            appleMusicLink: {
              type: 'string',
              description: 'The Apple Music link of the album.',
              format: 'uri',
            },
            createdAt: {
              type: 'string',
              description: 'The date the song was created.',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  AppRockskyArtist: {
    lexicon: 1,
    id: 'app.rocksky.artist',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of an artist.',
        record: {
          type: 'object',
          required: ['name', 'createdAt'],
          properties: {
            name: {
              type: 'string',
              description: 'The name of the artist.',
              minLength: 1,
              maxLength: 512,
            },
            bio: {
              type: 'string',
              description: 'The biography of the artist.',
              maxLength: 1000,
            },
            picture: {
              type: 'blob',
              description: 'The picture of the artist.',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 2000000,
            },
            tags: {
              type: 'array',
              description: 'The tags of the artist.',
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 256,
              },
            },
            born: {
              type: 'string',
              description: 'The birth date of the artist.',
              format: 'datetime',
            },
            died: {
              type: 'string',
              description: 'The death date of the artist.',
              format: 'datetime',
            },
            bornIn: {
              type: 'string',
              description: 'The birth place of the artist.',
              maxLength: 256,
            },
            createdAt: {
              type: 'string',
              description: 'The date the song was created.',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  AppRockskyLike: {
    lexicon: 1,
    id: 'app.rocksky.like',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of a like.',
        record: {
          type: 'object',
          required: ['subject', 'createdAt'],
          properties: {
            createdAt: {
              type: 'string',
              description: 'The date the like was created.',
              format: 'datetime',
            },
            subject: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
            },
          },
        },
      },
    },
  },
  AppRockskyLovedSong: {
    lexicon: 1,
    id: 'app.rocksky.lovedSong',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of a song.',
        record: {
          type: 'object',
          required: ['title', 'artist', 'album', 'duration', 'createdAt'],
          properties: {
            trackNumber: {
              type: 'integer',
              description: 'The track number of the song in the album.',
              minimum: 1,
            },
            discNumber: {
              type: 'integer',
              description: 'The disc number of the song in the album.',
              minimum: 1,
            },
            title: {
              type: 'string',
              description: 'The title of the song.',
              minLength: 1,
              maxLength: 512,
            },
            artist: {
              type: 'string',
              description: 'The artist of the song.',
              minLength: 1,
              maxLength: 256,
            },
            albumArtist: {
              type: 'string',
              description: 'The artist of the album the song is from.',
              minLength: 1,
              maxLength: 256,
            },
            album: {
              type: 'string',
              description: 'The album the song is from.',
              minLength: 1,
              maxLength: 256,
            },
            duration: {
              type: 'integer',
              description: 'The duration of the song in seconds.',
              minimum: 1,
            },
            releaseDate: {
              type: 'string',
              description: 'The release date of the song.',
              format: 'datetime',
            },
            year: {
              type: 'integer',
              description: 'The year the song was released.',
            },
            genre: {
              type: 'string',
              description: 'The genre of the song.',
              maxLength: 256,
            },
            tags: {
              type: 'array',
              description: 'The tags of the song.',
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 256,
              },
            },
            composer: {
              type: 'string',
              description: 'The composer of the song.',
              maxLength: 256,
            },
            lyrics: {
              type: 'string',
              description: 'The lyrics of the song.',
              maxLength: 10000,
            },
            copyrightMessage: {
              type: 'string',
              description: 'The copyright message.',
              minLength: 1,
              maxLength: 256,
            },
            wiki: {
              type: 'string',
              description: 'Informations about the song',
              maxLength: 10000,
            },
            albumArt: {
              type: 'blob',
              description: 'The album art of the song.',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 2000000,
            },
            youtubeLink: {
              type: 'string',
              description: 'The YouTube link of the song.',
              format: 'uri',
            },
            spotifyLink: {
              type: 'string',
              description: 'The Spotify link of the song.',
              format: 'uri',
            },
            tidalLink: {
              type: 'string',
              description: 'The Tidal link of the song.',
              format: 'uri',
            },
            appleMusicLink: {
              type: 'string',
              description: 'The Apple Music link of the song.',
              format: 'uri',
            },
            createdAt: {
              type: 'string',
              description: 'The date the song was created.',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  AppRockskyPlaylist: {
    lexicon: 1,
    id: 'app.rocksky.playlist',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of a playlist.',
        record: {
          type: 'object',
          required: ['name', 'createdAt'],
          properties: {
            name: {
              type: 'string',
              description: 'The name of the playlist.',
              minLength: 1,
              maxLength: 512,
            },
            description: {
              type: 'string',
              description: 'The playlist description.',
              minLength: 1,
              maxLength: 256,
            },
            picture: {
              type: 'blob',
              description: 'The picture of the playlist.',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 2000000,
            },
            tracks: {
              type: 'array',
              description: 'The tracks in the playlist.',
              items: {
                type: 'ref',
                ref: 'lex:app.rocksky.song#record',
              },
            },
            createdAt: {
              type: 'string',
              description: 'The date the playlist was created.',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  AppBskyActorProfile: {
    lexicon: 1,
    id: 'app.bsky.actor.profile',
    defs: {
      main: {
        type: 'record',
        description: 'A declaration of a Bluesky account profile.',
        key: 'literal:self',
        record: {
          type: 'object',
          properties: {
            displayName: {
              type: 'string',
              maxGraphemes: 64,
              maxLength: 640,
            },
            description: {
              type: 'string',
              description: 'Free-form profile description text.',
              maxGraphemes: 256,
              maxLength: 2560,
            },
            avatar: {
              type: 'blob',
              description:
                "Small image to be displayed next to posts from account. AKA, 'profile picture'",
              accept: ['image/png', 'image/jpeg'],
              maxSize: 1000000,
            },
            banner: {
              type: 'blob',
              description:
                'Larger horizontal image to display behind profile view.',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 1000000,
            },
            labels: {
              type: 'union',
              description:
                'Self-label values, specific to the Bluesky application, on the overall account.',
              refs: ['lex:com.atproto.label.defs#selfLabels'],
            },
            joinedViaStarterPack: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
            },
            createdAt: {
              type: 'string',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  AppRockskyRadio: {
    lexicon: 1,
    id: 'app.rocksky.radio',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of a radio station.',
        record: {
          type: 'object',
          required: ['name', 'url', 'createdAt'],
          properties: {
            name: {
              type: 'string',
              description: 'The name of the radio station.',
              minLength: 1,
              maxLength: 512,
            },
            url: {
              type: 'string',
              description: 'The URL of the radio station.',
              format: 'uri',
            },
            description: {
              type: 'string',
              description: 'The description of the radio station.',
              minLength: 1,
              maxLength: 256,
            },
            genre: {
              type: 'string',
              description: 'The genre of the radio station.',
              minLength: 1,
              maxLength: 256,
            },
            logo: {
              type: 'blob',
              description: 'The logo of the radio station.',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 2000000,
            },
            website: {
              type: 'string',
              description: 'The website of the radio station.',
              format: 'uri',
            },
            createdAt: {
              type: 'string',
              description: 'The date the radio was created.',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  AppRockskyScrobble: {
    lexicon: 1,
    id: 'app.rocksky.scrobble',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of a scrobble.',
        record: {
          type: 'object',
          required: [
            'title',
            'artist',
            'albumArtist',
            'album',
            'duration',
            'createdAt',
          ],
          properties: {
            trackNumber: {
              type: 'integer',
              description: 'The track number of the song in the album.',
              minimum: 1,
            },
            discNumber: {
              type: 'integer',
              description: 'The disc number of the song in the album.',
              minimum: 1,
            },
            title: {
              type: 'string',
              description: 'The title of the song.',
              minLength: 1,
              maxLength: 512,
            },
            artist: {
              type: 'string',
              description: 'The artist of the song.',
              minLength: 1,
              maxLength: 256,
            },
            albumArtist: {
              type: 'string',
              description: 'The artist of the album the song is from.',
              minLength: 1,
              maxLength: 256,
            },
            album: {
              type: 'string',
              description: 'The album the song is from.',
              minLength: 1,
              maxLength: 256,
            },
            duration: {
              type: 'integer',
              description: 'The duration of the song in seconds.',
              minimum: 1,
            },
            releaseDate: {
              type: 'string',
              description: 'The release date of the song.',
              format: 'datetime',
            },
            year: {
              type: 'integer',
              description: 'The year the song was released.',
            },
            genre: {
              type: 'string',
              description: 'The genre of the song.',
              maxLength: 256,
            },
            tags: {
              type: 'array',
              description: 'The tags of the song.',
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 256,
              },
            },
            composer: {
              type: 'string',
              description: 'The composer of the song.',
              maxLength: 256,
            },
            lyrics: {
              type: 'string',
              description: 'The lyrics of the song.',
              maxLength: 10000,
            },
            copyrightMessage: {
              type: 'string',
              description: 'The copyright message.',
              maxLength: 256,
            },
            wiki: {
              type: 'string',
              description: 'Informations about the song',
              maxLength: 10000,
            },
            albumArt: {
              type: 'blob',
              description: 'The album art of the song.',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 2000000,
            },
            youtubeLink: {
              type: 'string',
              description: 'The YouTube link of the song.',
              format: 'uri',
            },
            spotifyLink: {
              type: 'string',
              description: 'The Spotify link of the song.',
              format: 'uri',
            },
            tidalLink: {
              type: 'string',
              description: 'The Tidal link of the song.',
              format: 'uri',
            },
            appleMusicLink: {
              type: 'string',
              description: 'The Apple Music link of the song.',
              format: 'uri',
            },
            createdAt: {
              type: 'string',
              description: 'The date the song was created.',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  AppRockskyShout: {
    lexicon: 1,
    id: 'app.rocksky.shout',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of a shout.',
        record: {
          type: 'object',
          required: ['message', 'createdAt', 'subject'],
          properties: {
            message: {
              type: 'string',
              description: 'The message of the shout.',
              minLength: 1,
              maxLength: 1000,
            },
            createdAt: {
              type: 'string',
              description: 'The date the shout was created.',
              format: 'datetime',
            },
            parent: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
            },
            subject: {
              type: 'ref',
              ref: 'lex:com.atproto.repo.strongRef',
            },
          },
        },
      },
    },
  },
  AppRockskySong: {
    lexicon: 1,
    id: 'app.rocksky.song',
    defs: {
      main: {
        type: 'record',
        key: 'tid',
        description: 'A declaration of a song.',
        record: {
          type: 'object',
          required: [
            'title',
            'artist',
            'album',
            'albumArtist',
            'duration',
            'createdAt',
          ],
          properties: {
            trackNumber: {
              type: 'integer',
              description: 'The track number of the song in the album.',
              minimum: 1,
            },
            discNumber: {
              type: 'integer',
              description: 'The disc number of the song in the album.',
              minimum: 1,
            },
            title: {
              type: 'string',
              description: 'The title of the song.',
              minLength: 1,
              maxLength: 512,
            },
            artist: {
              type: 'string',
              description: 'The artist of the song.',
              minLength: 1,
              maxLength: 256,
            },
            albumArtist: {
              type: 'string',
              description: 'The artist of the album the song is from.',
              minLength: 1,
              maxLength: 256,
            },
            album: {
              type: 'string',
              description: 'The album the song is from.',
              minLength: 1,
              maxLength: 256,
            },
            duration: {
              type: 'integer',
              description: 'The duration of the song in seconds.',
              minimum: 1,
            },
            releaseDate: {
              type: 'string',
              description: 'The release date of the song.',
              format: 'datetime',
            },
            year: {
              type: 'integer',
              description: 'The year the song was released.',
            },
            genre: {
              type: 'string',
              description: 'The genre of the song.',
              minLength: 1,
              maxLength: 256,
            },
            tags: {
              type: 'array',
              description: 'The tags of the song.',
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 256,
              },
            },
            composer: {
              type: 'string',
              description: 'The composer of the song.',
              maxLength: 256,
            },
            lyrics: {
              type: 'string',
              description: 'The lyrics of the song.',
              maxLength: 10000,
            },
            copyrightMessage: {
              type: 'string',
              description: 'The copyright message.',
              maxLength: 256,
            },
            wiki: {
              type: 'string',
              description: 'Informations about the song',
              maxLength: 10000,
            },
            albumArt: {
              type: 'blob',
              description: 'The album art of the song.',
              accept: ['image/png', 'image/jpeg'],
              maxSize: 2000000,
            },
            youtubeLink: {
              type: 'string',
              description: 'The YouTube link of the song.',
              format: 'uri',
            },
            spotifyLink: {
              type: 'string',
              description: 'The Spotify link of the song.',
              format: 'uri',
            },
            tidalLink: {
              type: 'string',
              description: 'The Tidal link of the song.',
              format: 'uri',
            },
            appleMusicLink: {
              type: 'string',
              description: 'The Apple Music link of the song.',
              format: 'uri',
            },
            createdAt: {
              type: 'string',
              description: 'The date the song was created.',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  ComAtprotoRepoStrongRef: {
    lexicon: 1,
    id: 'com.atproto.repo.strongRef',
    description: 'A URI with a content-hash fingerprint.',
    defs: {
      main: {
        type: 'object',
        required: ['uri', 'cid'],
        properties: {
          uri: {
            type: 'string',
            format: 'at-uri',
          },
          cid: {
            type: 'string',
            format: 'cid',
          },
        },
      },
    },
  },
} as const satisfies Record<string, LexiconDoc>

export const schemas = Object.values(schemaDict)
export const lexicons: Lexicons = new Lexicons(schemas)
export const ids = {
  AppRockskyAlbum: 'app.rocksky.album',
  AppRockskyArtist: 'app.rocksky.artist',
  AppRockskyLike: 'app.rocksky.like',
  AppRockskyLovedSong: 'app.rocksky.lovedSong',
  AppRockskyPlaylist: 'app.rocksky.playlist',
  AppBskyActorProfile: 'app.bsky.actor.profile',
  AppRockskyRadio: 'app.rocksky.radio',
  AppRockskyScrobble: 'app.rocksky.scrobble',
  AppRockskyShout: 'app.rocksky.shout',
  AppRockskySong: 'app.rocksky.song',
  ComAtprotoRepoStrongRef: 'com.atproto.repo.strongRef',
}
