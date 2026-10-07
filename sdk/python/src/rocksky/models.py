# Generated from lexicons. Regenerate: bun tools/lexgen/generate.ts --python
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class RockskyModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow", strict=True)

class BlobRef(RockskyModel):
    type_: str = Field(alias="$type")
    ref: dict[str, str]
    mime_type: str = Field(alias="mimeType")
    size: int

class ActorArtistViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    picture: str | None = Field(default=None, alias="picture")
    uri: str | None = Field(default=None, alias="uri")
    user1_rank: int | None = Field(default=None, alias="user1Rank")
    user2_rank: int | None = Field(default=None, alias="user2Rank")
    weight: float | None = Field(default=None, alias="weight")

class ActorCompatibilityViewBasic(RockskyModel):
    compatibility_level: int | None = Field(default=None, alias="compatibilityLevel")
    shared_artists: int | None = Field(default=None, alias="sharedArtists")
    top_shared_artist_names: list[str] | None = Field(default=None, alias="topSharedArtistNames")
    top_shared_detailed_artists: list[ActorArtistViewBasic] | None = Field(default=None, alias="topSharedDetailedArtists")
    user1_artist_count: int | None = Field(default=None, alias="user1ArtistCount")
    user2_artist_count: int | None = Field(default=None, alias="user2ArtistCount")
    compatibility_percentage: float | None = Field(default=None, alias="compatibilityPercentage")

class ActorNeighbourViewBasic(RockskyModel):
    user_id: str | None = Field(default=None, alias="userId")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")
    shared_artists_count: int | None = Field(default=None, alias="sharedArtistsCount")
    top_shared_artist_names: list[str] | None = Field(default=None, alias="topSharedArtistNames")
    top_shared_artists_details: list[ArtistViewBasic] | None = Field(default=None, alias="topSharedArtistsDetails")
    similarity_score: float | None = Field(default=None, alias="similarityScore")

class ActorProfileViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class ActorProfileViewDetailed(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    spotify_user: ActorResponseSpotifyUserView | None = Field(default=None, alias="spotifyUser")
    spotify_connected: bool | None = Field(default=None, alias="spotifyConnected")
    googledrive: ActorResponseGoogledriveView | None = Field(default=None, alias="googledrive")
    dropbox: ActorResponseDropboxView | None = Field(default=None, alias="dropbox")

class ActorResponseDropboxView(RockskyModel):
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    id: str | None = Field(default=None, alias="id")
    email: str | None = Field(default=None, alias="email")
    is_beta_user: bool | None = Field(default=None, alias="isBetaUser")
    user_id: str | None = Field(default=None, alias="userId")
    xata_version: str | None = Field(default=None, alias="xataVersion")

class ActorResponseGoogledriveView(RockskyModel):
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class ActorResponseSpotifyUserView(RockskyModel):
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    id: str | None = Field(default=None, alias="id")
    xata_version: int | None = Field(default=None, alias="xataVersion")
    user_id: str | None = Field(default=None, alias="userId")
    is_beta_user: bool | None = Field(default=None, alias="isBetaUser")
    spotify_app_id: str | None = Field(default=None, alias="spotifyAppId")

class ActorTrackView(RockskyModel):
    name: str = Field(alias="name")
    artist: str = Field(alias="artist")
    album: str | None = Field(default=None, alias="album")
    album_cover_url: str | None = Field(default=None, alias="albumCoverUrl")
    duration_ms: int | None = Field(default=None, alias="durationMs")
    source: str | None = Field(default=None, alias="source")
    recording_mb_id: str | None = Field(default=None, alias="recordingMbId")
    track_number: int | None = Field(default=None, alias="trackNumber")

class AddDirectoryToQueueParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    directory: str = Field(alias="directory")
    position: int | None = Field(default=None, alias="position")
    shuffle: bool | None = Field(default=None, alias="shuffle")

class AddItemsToQueueParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    items: list[str] = Field(alias="items")
    position: int | None = Field(default=None, alias="position")
    shuffle: bool | None = Field(default=None, alias="shuffle")

class AddSongsOutput(RockskyModel):
    uris: list[str] = Field(alias="uris")

class AddSongsParams(RockskyModel):
    uri: str = Field(alias="uri")
    songs: list[str] = Field(alias="songs")

class AlbumDiscogsArtistView(RockskyModel):
    artist_id: int | None = Field(default=None, alias="artistId")
    name: str | None = Field(default=None, alias="name")
    anv: str | None = Field(default=None, alias="anv")
    join_phrase: str | None = Field(default=None, alias="joinPhrase")
    role: str | None = Field(default=None, alias="role")

class AlbumDiscogsCreditView(RockskyModel):
    artist_id: int | None = Field(default=None, alias="artistId")
    name: str | None = Field(default=None, alias="name")
    role: str | None = Field(default=None, alias="role")
    tracks: str | None = Field(default=None, alias="tracks")

class AlbumDiscogsIdentifierView(RockskyModel):
    type_: str | None = Field(default=None, alias="type")
    value: str | None = Field(default=None, alias="value")
    description: str | None = Field(default=None, alias="description")

class AlbumDiscogsLabelView(RockskyModel):
    label_id: int | None = Field(default=None, alias="labelId")
    name: str | None = Field(default=None, alias="name")
    catalog_number: str | None = Field(default=None, alias="catalogNumber")
    kind: str | None = Field(default=None, alias="kind")
    entity_type: str | None = Field(default=None, alias="entityType")

class AlbumDiscogsMasterView(RockskyModel):
    master_id: int | None = Field(default=None, alias="masterId")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    year: int | None = Field(default=None, alias="year")
    main_release_id: int | None = Field(default=None, alias="mainReleaseId")
    url: str | None = Field(default=None, alias="url")
    genres: list[str] | None = Field(default=None, alias="genres")
    styles: list[str] | None = Field(default=None, alias="styles")

class AlbumDiscogsTrackView(RockskyModel):
    position: str | None = Field(default=None, alias="position")
    type_: str | None = Field(default=None, alias="type")
    title: str | None = Field(default=None, alias="title")
    duration: str | None = Field(default=None, alias="duration")
    duration_ms: int | None = Field(default=None, alias="durationMs")
    disc_number: int | None = Field(default=None, alias="discNumber")
    track_number: int | None = Field(default=None, alias="trackNumber")

class AlbumDiscogsView(RockskyModel):
    release_id: int | None = Field(default=None, alias="releaseId")
    master_id: int | None = Field(default=None, alias="masterId")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album_art: str | None = Field(default=None, alias="albumArt")
    year: int | None = Field(default=None, alias="year")
    original_year: int | None = Field(default=None, alias="originalYear")
    release_date: str | None = Field(default=None, alias="releaseDate")
    country: str | None = Field(default=None, alias="country")
    label: str | None = Field(default=None, alias="label")
    catalog_number: str | None = Field(default=None, alias="catalogNumber")
    barcode: str | None = Field(default=None, alias="barcode")
    formats: list[str] | None = Field(default=None, alias="formats")
    genres: list[str] | None = Field(default=None, alias="genres")
    styles: list[str] | None = Field(default=None, alias="styles")
    url: str | None = Field(default=None, alias="url")
    score: int | None = Field(default=None, alias="score")
    credits: list[AlbumDiscogsCreditView] | None = Field(default=None, alias="credits")
    tracklist: list[AlbumDiscogsTrackView] | None = Field(default=None, alias="tracklist")
    labels: list[AlbumDiscogsLabelView] | None = Field(default=None, alias="labels")
    identifiers: list[AlbumDiscogsIdentifierView] | None = Field(default=None, alias="identifiers")
    artists: list[AlbumDiscogsArtistView] | None = Field(default=None, alias="artists")
    master: AlbumDiscogsMasterView | None = Field(default=None, alias="master")

class AlbumGetAlbumParams(RockskyModel):
    uri: str = Field(alias="uri")

class AlbumRecord(RockskyModel):
    title: str = Field(alias="title")
    artist: str = Field(alias="artist")
    duration: int | None = Field(default=None, alias="duration")
    release_date: str | None = Field(default=None, alias="releaseDate")
    year: int | None = Field(default=None, alias="year")
    genre: str | None = Field(default=None, alias="genre")
    album_art: BlobRef | None = Field(default=None, alias="albumArt")
    album_art_url: str | None = Field(default=None, alias="albumArtUrl")
    tags: list[str] | None = Field(default=None, alias="tags")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    created_at: str = Field(alias="createdAt")

class AlbumViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    uri: str | None = Field(default=None, alias="uri")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    year: int | None = Field(default=None, alias="year")
    album_art: str | None = Field(default=None, alias="albumArt")
    release_date: str | None = Field(default=None, alias="releaseDate")
    sha256: str | None = Field(default=None, alias="sha256")
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    discogs_release_id: str | None = Field(default=None, alias="discogsReleaseId")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    xata_version: int | None = Field(default=None, alias="xataVersion")

class AlbumViewDetailed(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    uri: str | None = Field(default=None, alias="uri")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    year: int | None = Field(default=None, alias="year")
    album_art: str | None = Field(default=None, alias="albumArt")
    release_date: str | None = Field(default=None, alias="releaseDate")
    sha256: str | None = Field(default=None, alias="sha256")
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    tags: list[str] | None = Field(default=None, alias="tags")
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")
    discogs: AlbumDiscogsView | None = Field(default=None, alias="discogs")
    created_at: str | None = Field(default=None, alias="createdAt")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    discogs_release_id: str | None = Field(default=None, alias="discogsReleaseId")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    xata_version: int | None = Field(default=None, alias="xataVersion")

class ApiKeyView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    description: str | None = Field(default=None, alias="description")
    created_at: str | None = Field(default=None, alias="createdAt")

class ArtistGetArtistParams(RockskyModel):
    uri: str = Field(alias="uri")

class ArtistGetArtistsOutput(RockskyModel):
    artists: list[ArtistViewBasic] | None = Field(default=None, alias="artists")

class ArtistGetArtistsParams(RockskyModel):
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    names: str | None = Field(default=None, alias="names")
    genre: str | None = Field(default=None, alias="genre")
    filter: str | None = Field(default=None, alias="filter")

class ArtistListenerViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")
    most_listened_song: ArtistSongViewBasic | None = Field(default=None, alias="mostListenedSong")
    total_plays: int | None = Field(default=None, alias="totalPlays")
    rank: int | None = Field(default=None, alias="rank")

class ArtistMbid(RockskyModel):
    mbid: str | None = Field(default=None, alias="mbid")
    name: str | None = Field(default=None, alias="name")

class ArtistRecentListenerView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")
    timestamp: str | None = Field(default=None, alias="timestamp")
    scrobble_uri: str | None = Field(default=None, alias="scrobbleUri")

class ArtistRecord(RockskyModel):
    name: str = Field(alias="name")
    bio: str | None = Field(default=None, alias="bio")
    picture: BlobRef | None = Field(default=None, alias="picture")
    picture_url: str | None = Field(default=None, alias="pictureUrl")
    tags: list[str] | None = Field(default=None, alias="tags")
    born: str | None = Field(default=None, alias="born")
    died: str | None = Field(default=None, alias="died")
    born_in: str | None = Field(default=None, alias="bornIn")
    created_at: str = Field(alias="createdAt")

class ArtistSongViewBasic(RockskyModel):
    uri: str | None = Field(default=None, alias="uri")
    title: str | None = Field(default=None, alias="title")
    play_count: int | None = Field(default=None, alias="playCount")

class ArtistViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    uri: str | None = Field(default=None, alias="uri")
    name: str | None = Field(default=None, alias="name")
    picture: str | None = Field(default=None, alias="picture")
    sha256: str | None = Field(default=None, alias="sha256")
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    tags: list[str] | None = Field(default=None, alias="tags")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    biography: str | None = Field(default=None, alias="biography")
    born: str | None = Field(default=None, alias="born")
    born_in: str | None = Field(default=None, alias="bornIn")
    died: str | None = Field(default=None, alias="died")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    genres: list[str] | None = Field(default=None, alias="genres")
    xata_version: int | None = Field(default=None, alias="xataVersion")

class ArtistViewDetailed(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    uri: str | None = Field(default=None, alias="uri")
    name: str | None = Field(default=None, alias="name")
    picture: str | None = Field(default=None, alias="picture")
    sha256: str | None = Field(default=None, alias="sha256")
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    tags: list[str] | None = Field(default=None, alias="tags")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    biography: str | None = Field(default=None, alias="biography")
    born: str | None = Field(default=None, alias="born")
    born_in: str | None = Field(default=None, alias="bornIn")
    died: str | None = Field(default=None, alias="died")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    genres: list[str] | None = Field(default=None, alias="genres")
    xata_version: int | None = Field(default=None, alias="xataVersion")

class ChartsDecadeViewBasic(RockskyModel):
    decade: int | None = Field(default=None, alias="decade")
    scrobbles: int | None = Field(default=None, alias="scrobbles")
    unique_albums: int | None = Field(default=None, alias="uniqueAlbums")

class ChartsScrobblerViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")
    scrobbles: int | None = Field(default=None, alias="scrobbles")
    unique_artists: int | None = Field(default=None, alias="uniqueArtists")
    unique_tracks: int | None = Field(default=None, alias="uniqueTracks")

class ChartsScrobbleViewBasic(RockskyModel):
    date: str | None = Field(default=None, alias="date")
    count: int | None = Field(default=None, alias="count")

class ChartsView(RockskyModel):
    scrobbles: list[ChartsScrobbleViewBasic] | None = Field(default=None, alias="scrobbles")

class CreateApikeyInput(RockskyModel):
    name: str = Field(alias="name")
    description: str | None = Field(default=None, alias="description")

class CreateScrobbleInput(RockskyModel):
    title: str = Field(alias="title")
    artist: str = Field(alias="artist")
    album: str | None = Field(default=None, alias="album")
    duration: int | None = Field(default=None, alias="duration")
    mb_id: str | None = Field(default=None, alias="mbId")
    isrc: str | None = Field(default=None, alias="isrc")
    album_art: str | None = Field(default=None, alias="albumArt")
    track_number: int | None = Field(default=None, alias="trackNumber")
    release_date: str | None = Field(default=None, alias="releaseDate")
    year: int | None = Field(default=None, alias="year")
    disc_number: int | None = Field(default=None, alias="discNumber")
    lyrics: str | None = Field(default=None, alias="lyrics")
    composer: str | None = Field(default=None, alias="composer")
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    label: str | None = Field(default=None, alias="label")
    artist_picture: str | None = Field(default=None, alias="artistPicture")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    lastfm_link: str | None = Field(default=None, alias="lastfmLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    deezer_link: str | None = Field(default=None, alias="deezerLink")
    timestamp: int | None = Field(default=None, alias="timestamp")

class CreateShoutInput(RockskyModel):
    message: str | None = Field(default=None, alias="message")

class CreateSongInput(RockskyModel):
    title: str = Field(alias="title")
    artist: str = Field(alias="artist")
    album_artist: str = Field(alias="albumArtist")
    album: str = Field(alias="album")
    duration: int | None = Field(default=None, alias="duration")
    mb_id: str | None = Field(default=None, alias="mbId")
    isrc: str | None = Field(default=None, alias="isrc")
    album_art: str | None = Field(default=None, alias="albumArt")
    track_number: int | None = Field(default=None, alias="trackNumber")
    release_date: str | None = Field(default=None, alias="releaseDate")
    year: int | None = Field(default=None, alias="year")
    disc_number: int | None = Field(default=None, alias="discNumber")
    lyrics: str | None = Field(default=None, alias="lyrics")

class DeleteAlbumInput(RockskyModel):
    id: str = Field(alias="id")

class DeleteAlbumOutput(RockskyModel):
    status: str = Field(alias="status")
    deleted: int = Field(alias="deleted")

class DeletePlaylistInput(RockskyModel):
    id: str = Field(alias="id")

class DeletePlaylistOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    atproto_error: str | None = Field(default=None, alias="atprotoError")

class DeletePresetParams(RockskyModel):
    rkey: str = Field(alias="rkey")

class DeleteSongInput(RockskyModel):
    id: str = Field(alias="id")

class DeleteSongOutput(RockskyModel):
    status: str = Field(alias="status")
    deleted: int = Field(alias="deleted")

class DescribeFeedGeneratorOutput(RockskyModel):
    did: str | None = Field(default=None, alias="did")
    feeds: list[FeedUriView] | None = Field(default=None, alias="feeds")

class DislikeShoutInput(RockskyModel):
    uri: str | None = Field(default=None, alias="uri")

class DislikeSongInput(RockskyModel):
    uri: str | None = Field(default=None, alias="uri")

class DropboxDownloadFileParams(RockskyModel):
    file_id: str = Field(alias="fileId")

class DropboxFileListView(RockskyModel):
    files: list[DropboxFileView] | None = Field(default=None, alias="files")
    directory: DropboxResponseDirectoryView | None = Field(default=None, alias="directory")
    parent_directory: DropboxResponseParentDirectoryView | None = Field(default=None, alias="parentDirectory")
    directories: list[DropboxResponseDirectoriesItemView] | None = Field(default=None, alias="directories")

class DropboxFileView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    path_lower: str | None = Field(default=None, alias="pathLower")
    path_display: str | None = Field(default=None, alias="pathDisplay")
    client_modified: str | None = Field(default=None, alias="clientModified")
    server_modified: str | None = Field(default=None, alias="serverModified")
    file_id: str | None = Field(default=None, alias="fileId")
    directory_id: str | None = Field(default=None, alias="directoryId")
    track_id: str | None = Field(default=None, alias="trackId")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class DropboxGetFilesParams(RockskyModel):
    at: str | None = Field(default=None, alias="at")

class DropboxResponseDirectoriesItemView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    file_id: str | None = Field(default=None, alias="fileId")
    path: str | None = Field(default=None, alias="path")
    parent_id: str | None = Field(default=None, alias="parentId")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class DropboxResponseDirectoryView(RockskyModel):
    pass

class DropboxResponseParentDirectoryView(RockskyModel):
    pass

class DropboxTemporaryLinkView(RockskyModel):
    link: str | None = Field(default=None, alias="link")

class EqualizerPresetView(RockskyModel):
    uri: str = Field(alias="uri")
    rkey: str = Field(alias="rkey")
    name: str = Field(alias="name")
    precut: int | None = Field(default=None, alias="precut")
    bands: list[RockboxEqualizerBand] = Field(alias="bands")
    created_at: str = Field(alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class EqualizerRecord(RockskyModel):
    name: str = Field(alias="name")
    precut: int | None = Field(default=None, alias="precut")
    bands: list[RockboxEqualizerBand] = Field(alias="bands")
    created_at: str = Field(alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class FeedGeneratorsView(RockskyModel):
    feeds: list[FeedGeneratorView] | None = Field(default=None, alias="feeds")

class FeedGeneratorView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    description: str | None = Field(default=None, alias="description")
    uri: str | None = Field(default=None, alias="uri")
    avatar: str | None = Field(default=None, alias="avatar")
    creator: ActorProfileViewBasic | None = Field(default=None, alias="creator")
    did: str | None = Field(default=None, alias="did")

class FeedItemView(RockskyModel):
    scrobble: ScrobbleViewBasic | None = Field(default=None, alias="scrobble")

class FeedRecommendationsView(RockskyModel):
    recommendations: list[FeedRecommendationView] | None = Field(default=None, alias="recommendations")
    cursor: str | None = Field(default=None, alias="cursor")

class FeedRecommendationView(RockskyModel):
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album: str | None = Field(default=None, alias="album")
    album_art: str | None = Field(default=None, alias="albumArt")
    track_uri: str | None = Field(default=None, alias="trackUri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    album_uri: str | None = Field(default=None, alias="albumUri")
    genres: list[str] | None = Field(default=None, alias="genres")
    source: str | None = Field(default=None, alias="source")
    likes_count: int | None = Field(default=None, alias="likesCount")
    recommendation_score: float | None = Field(default=None, alias="recommendationScore")

class FeedRecommendedAlbumsView(RockskyModel):
    albums: list[FeedRecommendedAlbumView] | None = Field(default=None, alias="albums")
    cursor: str | None = Field(default=None, alias="cursor")

class FeedRecommendedAlbumView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    uri: str | None = Field(default=None, alias="uri")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    year: int | None = Field(default=None, alias="year")
    album_art: str | None = Field(default=None, alias="albumArt")
    source: str | None = Field(default=None, alias="source")
    recommendation_score: float | None = Field(default=None, alias="recommendationScore")

class FeedRecommendedArtistsView(RockskyModel):
    artists: list[FeedRecommendedArtistView] | None = Field(default=None, alias="artists")
    cursor: str | None = Field(default=None, alias="cursor")

class FeedRecommendedArtistView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    uri: str | None = Field(default=None, alias="uri")
    name: str | None = Field(default=None, alias="name")
    picture: str | None = Field(default=None, alias="picture")
    genres: list[str] | None = Field(default=None, alias="genres")
    source: str | None = Field(default=None, alias="source")
    recommendation_score: float | None = Field(default=None, alias="recommendationScore")

class FeedSearchFederation(RockskyModel):
    index_uid: str | None = Field(default=None, alias="indexUid")

class FeedSearchHit(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = Field(default=None, alias="uri")
    album: str | None = Field(default=None, alias="album")
    duration: int | None = Field(default=None, alias="duration")
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    play_count: int | None = Field(default=None, alias="playCount")
    likes_count: int | None = Field(default=None, alias="likesCount")
    liked: bool | None = Field(default=None, alias="liked")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    album_uri: str | None = Field(default=None, alias="albumUri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    sha256: str | None = Field(default=None, alias="sha256")
    mbid: str | None = Field(default=None, alias="mbid")
    isrc: str | None = Field(default=None, alias="isrc")
    tags: list[str] | None = Field(default=None, alias="tags")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    mb_id: str | None = Field(default=None, alias="mbId")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    lyrics: str | None = Field(default=None, alias="lyrics")
    composer: str | None = Field(default=None, alias="composer")
    genre: str | None = Field(default=None, alias="genre")
    label: str | None = Field(default=None, alias="label")
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    key: str | None = Field(default=None, alias="key")
    acoustid_fingerprint: str | None = Field(default=None, alias="acoustidFingerprint")
    xata_version: int | None = Field(default=None, alias="xataVersion")
    year: int | None = Field(default=None, alias="year")
    release_date: str | None = Field(default=None, alias="releaseDate")
    discogs_release_id: str | None = Field(default=None, alias="discogsReleaseId")
    name: str | None = Field(default=None, alias="name")
    picture: str | None = Field(default=None, alias="picture")
    biography: str | None = Field(default=None, alias="biography")
    born: str | None = Field(default=None, alias="born")
    born_in: str | None = Field(default=None, alias="bornIn")
    died: str | None = Field(default=None, alias="died")
    genres: list[str] | None = Field(default=None, alias="genres")
    curator_did: str | None = Field(default=None, alias="curatorDid")
    curator_handle: str | None = Field(default=None, alias="curatorHandle")
    curator_name: str | None = Field(default=None, alias="curatorName")
    curator_avatar_url: str | None = Field(default=None, alias="curatorAvatarUrl")
    description: str | None = Field(default=None, alias="description")
    cover_image_url: str | None = Field(default=None, alias="coverImageUrl")
    track_count: int | None = Field(default=None, alias="trackCount")
    track_arts: list[str] | None = Field(default=None, alias="trackArts")
    curator_d_id: str | None = Field(default=None, alias="curatorDId")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")
    federation: FeedSearchFederation | None = Field(default=None, alias="_federation")
    bpm: float | None = Field(default=None, alias="bpm")

class FeedSearchParams(RockskyModel):
    query: str = Field(alias="query")

class FeedSearchResultsView(RockskyModel):
    hits: list[FeedSearchHit] | None = Field(default=None, alias="hits")
    processing_time_ms: int | None = Field(default=None, alias="processingTimeMs")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    estimated_total_hits: int | None = Field(default=None, alias="estimatedTotalHits")

class FeedStoriesView(RockskyModel):
    stories: list[FeedStoryView] | None = Field(default=None, alias="stories")

class FeedStoryView(RockskyModel):
    album: str | None = Field(default=None, alias="album")
    album_art: str | None = Field(default=None, alias="albumArt")
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album_uri: str | None = Field(default=None, alias="albumUri")
    artist: str | None = Field(default=None, alias="artist")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    avatar: str | None = Field(default=None, alias="avatar")
    created_at: str | None = Field(default=None, alias="createdAt")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    id: str | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    track_id: str | None = Field(default=None, alias="trackId")
    track_uri: str | None = Field(default=None, alias="trackUri")
    uri: str | None = Field(default=None, alias="uri")
    liked: bool | None = Field(default=None, alias="liked")
    likes_count: int | None = Field(default=None, alias="likesCount")

class FeedUriView(RockskyModel):
    uri: str | None = Field(default=None, alias="uri")

class FeedView(RockskyModel):
    feed: list[FeedItemView] | None = Field(default=None, alias="feed")
    cursor: str | None = Field(default=None, alias="cursor")
    scrobbles: list[ScrobbleViewBasic] | None = Field(default=None, alias="scrobbles")

class FollowAccountOutput(RockskyModel):
    subject: ActorProfileViewBasic = Field(alias="subject")
    followers: list[ActorProfileViewBasic] = Field(alias="followers")
    cursor: str | None = Field(default=None, alias="cursor")

class FollowAccountParams(RockskyModel):
    account: str = Field(alias="account")

class FollowRecord(RockskyModel):
    created_at: str = Field(alias="createdAt")
    subject: str = Field(alias="subject")
    via: StrongRef | None = Field(default=None, alias="via")

class GeneratorRecord(RockskyModel):
    did: str = Field(alias="did")
    avatar: BlobRef | None = Field(default=None, alias="avatar")
    display_name: str = Field(alias="displayName")
    description: str | None = Field(default=None, alias="description")
    created_at: str = Field(alias="createdAt")

class GetActorAlbumsOutput(RockskyModel):
    albums: list[AlbumViewBasic] | None = Field(default=None, alias="albums")

class GetActorAlbumsParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")

class GetActorArtistsOutput(RockskyModel):
    artists: list[ArtistViewBasic] | None = Field(default=None, alias="artists")

class GetActorArtistsParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")

class GetActorCompatibilityOutput(RockskyModel):
    compatibility: ActorCompatibilityViewBasic | None = Field(default=None, alias="compatibility")

class GetActorCompatibilityParams(RockskyModel):
    did: str = Field(alias="did")

class GetActorLovedSongsOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")

class GetActorLovedSongsParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")

class GetActorNeighboursOutput(RockskyModel):
    neighbours: list[ActorNeighbourViewBasic] | None = Field(default=None, alias="neighbours")

class GetActorNeighboursParams(RockskyModel):
    did: str = Field(alias="did")

class GetActorPlaylistsOutput(RockskyModel):
    playlists: list[PlaylistViewBasic] | None = Field(default=None, alias="playlists")

class GetActorPlaylistsParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    filter: str | None = Field(default=None, alias="filter")

class GetActorScrobblesOutput(RockskyModel):
    scrobbles: list[ScrobbleViewBasic] | None = Field(default=None, alias="scrobbles")

class GetActorScrobblesParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")

class GetActorSongsOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")

class GetActorSongsParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")

class GetAlbumInfoOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    album_info: JsonValue | None = Field(default=None, alias="albumInfo")

class GetAlbumInfoParams(RockskyModel):
    id: str = Field(alias="id")

class GetAlbumListOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    album_list2: JsonValue | None = Field(default=None, alias="albumList2")

class GetAlbumListParams(RockskyModel):
    type_: str = Field(alias="type")
    size: int | None = Field(default=None, alias="size")
    offset: int | None = Field(default=None, alias="offset")
    from_year: int | None = Field(default=None, alias="fromYear")
    to_year: int | None = Field(default=None, alias="toYear")
    genre: str | None = Field(default=None, alias="genre")

class GetAlbumRecommendationsParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")

class GetAlbumShoutsOutput(RockskyModel):
    shouts: list[ShoutView] | None = Field(default=None, alias="shouts")

class GetAlbumShoutsParams(RockskyModel):
    uri: str = Field(alias="uri")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")

class GetAlbumsOutput(RockskyModel):
    albums: list[AlbumViewBasic] | None = Field(default=None, alias="albums")

class GetAlbumsParams(RockskyModel):
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    genre: str | None = Field(default=None, alias="genre")
    filter: str | None = Field(default=None, alias="filter")

class GetAlbumTracksOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")

class GetAlbumTracksParams(RockskyModel):
    uri: str = Field(alias="uri")

class GetApikeysOutput(RockskyModel):
    apikeys: list[ApiKeyView] | None = Field(default=None, alias="apikeys")

class GetApikeysParams(RockskyModel):
    offset: int | None = Field(default=None, alias="offset")
    limit: int | None = Field(default=None, alias="limit")

class GetArtistAlbumsOutput(RockskyModel):
    albums: list[AlbumViewBasic] | None = Field(default=None, alias="albums")

class GetArtistAlbumsParams(RockskyModel):
    uri: str = Field(alias="uri")

class GetArtistInfoOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    artist_info2: JsonValue | None = Field(default=None, alias="artistInfo2")

class GetArtistInfoParams(RockskyModel):
    id: str = Field(alias="id")

class GetArtistListenersOutput(RockskyModel):
    listeners: list[ArtistListenerViewBasic] | None = Field(default=None, alias="listeners")

class GetArtistListenersParams(RockskyModel):
    uri: str = Field(alias="uri")
    offset: int | None = Field(default=None, alias="offset")
    limit: int | None = Field(default=None, alias="limit")

class GetArtistRecentListenersOutput(RockskyModel):
    listeners: list[ArtistRecentListenerView] | None = Field(default=None, alias="listeners")

class GetArtistRecentListenersParams(RockskyModel):
    uri: str = Field(alias="uri")
    offset: int | None = Field(default=None, alias="offset")
    limit: int | None = Field(default=None, alias="limit")

class GetArtistRecommendationsParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")

class GetArtistShoutsOutput(RockskyModel):
    shouts: list[ShoutView] | None = Field(default=None, alias="shouts")

class GetArtistShoutsParams(RockskyModel):
    uri: str = Field(alias="uri")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")

class GetArtistTracksOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")

class GetArtistTracksParams(RockskyModel):
    uri: str | None = Field(default=None, alias="uri")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")

class GetAudioSettingsParams(RockskyModel):
    did: str | None = Field(default=None, alias="did")

class GetCoverArtUrlOutput(RockskyModel):
    url: str = Field(alias="url")

class GetCoverArtUrlParams(RockskyModel):
    id: str = Field(alias="id")
    size: int | None = Field(default=None, alias="size")

class GetDecadesOutput(RockskyModel):
    decades: list[ChartsDecadeViewBasic] | None = Field(default=None, alias="decades")

class GetDecadesParams(RockskyModel):
    did: str | None = Field(default=None, alias="did")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")

class GetDownloadUrlOutput(RockskyModel):
    url: str = Field(alias="url")

class GetDownloadUrlParams(RockskyModel):
    id: str = Field(alias="id")

class GetFeedGeneratorOutput(RockskyModel):
    view: FeedGeneratorView | None = Field(default=None, alias="view")

class GetFeedGeneratorParams(RockskyModel):
    feed: str = Field(alias="feed")

class GetFeedGeneratorsParams(RockskyModel):
    size: int | None = Field(default=None, alias="size")

class GetFeedParams(RockskyModel):
    feed: str = Field(alias="feed")
    limit: int | None = Field(default=None, alias="limit")
    cursor: str | None = Field(default=None, alias="cursor")

class GetFeedSkeletonOutput(RockskyModel):
    scrobbles: list[ScrobbleViewBasic] | None = Field(default=None, alias="scrobbles")
    cursor: str | None = Field(default=None, alias="cursor")

class GetFeedSkeletonParams(RockskyModel):
    feed: str = Field(alias="feed")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    cursor: str | None = Field(default=None, alias="cursor")

class GetFileParams(RockskyModel):
    file_id: str = Field(alias="fileId")

class GetFollowersOutput(RockskyModel):
    subject: ActorProfileViewBasic = Field(alias="subject")
    followers: list[ActorProfileViewBasic] = Field(alias="followers")
    cursor: str | None = Field(default=None, alias="cursor")
    count: int | None = Field(default=None, alias="count")

class GetFollowersParams(RockskyModel):
    actor: str = Field(alias="actor")
    limit: int | None = Field(default=None, alias="limit")
    dids: list[str] | None = Field(default=None, alias="dids")
    cursor: str | None = Field(default=None, alias="cursor")

class GetFollowsOutput(RockskyModel):
    subject: ActorProfileViewBasic = Field(alias="subject")
    follows: list[ActorProfileViewBasic] = Field(alias="follows")
    cursor: str | None = Field(default=None, alias="cursor")
    count: int | None = Field(default=None, alias="count")

class GetFollowsParams(RockskyModel):
    actor: str = Field(alias="actor")
    limit: int | None = Field(default=None, alias="limit")
    dids: list[str] | None = Field(default=None, alias="dids")
    cursor: str | None = Field(default=None, alias="cursor")

class GetGenresOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    genres: JsonValue | None = Field(default=None, alias="genres")

class GetGenresParams(RockskyModel):
    pass

class GetGlobalStatsParams(RockskyModel):
    pass

class GetIndexesOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    indexes: JsonValue | None = Field(default=None, alias="indexes")

class GetIndexesParams(RockskyModel):
    pass

class GetInternetRadioStationsOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    internet_radio_stations: JsonValue | None = Field(default=None, alias="internetRadioStations")

class GetInternetRadioStationsParams(RockskyModel):
    pass

class GetKnownFollowersOutput(RockskyModel):
    subject: ActorProfileViewBasic = Field(alias="subject")
    followers: list[ActorProfileViewBasic] = Field(alias="followers")
    cursor: str | None = Field(default=None, alias="cursor")

class GetKnownFollowersParams(RockskyModel):
    actor: str = Field(alias="actor")
    limit: int | None = Field(default=None, alias="limit")
    cursor: str | None = Field(default=None, alias="cursor")

class GetLicenseOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    license: JsonValue | None = Field(default=None, alias="license")

class GetLicenseParams(RockskyModel):
    pass

class GetLyricsOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    lyrics: JsonValue | None = Field(default=None, alias="lyrics")

class GetLyricsParams(RockskyModel):
    artist: str | None = Field(default=None, alias="artist")
    title: str | None = Field(default=None, alias="title")

class GetMetadataOutput(RockskyModel):
    metadata: JsonValue | None = Field(default=None, alias="metadata")

class GetMetadataParams(RockskyModel):
    path: str = Field(alias="path")

class GetMirrorSourcesOutput(RockskyModel):
    sources: list[MirrorSourceView] = Field(alias="sources")

class GetMirrorSourcesParams(RockskyModel):
    pass

class GetMusicDirectoryOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    directory: JsonValue | None = Field(default=None, alias="directory")

class GetMusicDirectoryParams(RockskyModel):
    id: str = Field(alias="id")

class GetMusicFoldersOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    music_folders: JsonValue | None = Field(default=None, alias="musicFolders")

class GetMusicFoldersParams(RockskyModel):
    pass

class GetNowPlayingOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    now_playing: JsonValue | None = Field(default=None, alias="nowPlaying")

class GetNowPlayingParams(RockskyModel):
    pass

class GetPlaybackQueueParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")

class GetPlayQueueOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    play_queue: JsonValue | None = Field(default=None, alias="playQueue")

class GetPlayQueueParams(RockskyModel):
    pass

class GetProfileParams(RockskyModel):
    did: str | None = Field(default=None, alias="did")

class GetProfileShoutsOutput(RockskyModel):
    shouts: list[ShoutView] | None = Field(default=None, alias="shouts")

class GetProfileShoutsParams(RockskyModel):
    did: str = Field(alias="did")
    offset: int | None = Field(default=None, alias="offset")
    limit: int | None = Field(default=None, alias="limit")

class GetRandomSongsOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    random_songs: JsonValue | None = Field(default=None, alias="randomSongs")

class GetRandomSongsParams(RockskyModel):
    size: int | None = Field(default=None, alias="size")
    genre: str | None = Field(default=None, alias="genre")
    from_year: int | None = Field(default=None, alias="fromYear")
    to_year: int | None = Field(default=None, alias="toYear")

class GetRecommendationsParams(RockskyModel):
    did: str = Field(alias="did")
    limit: int | None = Field(default=None, alias="limit")

class GetScanStatusOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    scan_status: JsonValue | None = Field(default=None, alias="scanStatus")

class GetScanStatusParams(RockskyModel):
    pass

class GetScrobbleParams(RockskyModel):
    uri: str = Field(alias="uri")

class GetScrobblesChartParams(RockskyModel):
    did: str | None = Field(default=None, alias="did")
    artisturi: str | None = Field(default=None, alias="artisturi")
    albumuri: str | None = Field(default=None, alias="albumuri")
    songuri: str | None = Field(default=None, alias="songuri")
    genre: str | None = Field(default=None, alias="genre")
    from_: str | None = Field(default=None, alias="from")
    to: str | None = Field(default=None, alias="to")

class GetScrobblesOutput(RockskyModel):
    scrobbles: list[ScrobbleViewBasic] | None = Field(default=None, alias="scrobbles")

class GetScrobblesParams(RockskyModel):
    did: str | None = Field(default=None, alias="did")
    following: bool | None = Field(default=None, alias="following")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    filter: str | None = Field(default=None, alias="filter")

class GetShoutRepliesOutput(RockskyModel):
    shouts: list[ShoutView] | None = Field(default=None, alias="shouts")

class GetShoutRepliesParams(RockskyModel):
    uri: str = Field(alias="uri")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")

class GetSimilarSongsOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    similar_songs2: JsonValue | None = Field(default=None, alias="similarSongs2")

class GetSimilarSongsParams(RockskyModel):
    id: str = Field(alias="id")
    count: int | None = Field(default=None, alias="count")

class GetSongRecentListenersOutput(RockskyModel):
    listeners: list[SongRecentListenerView] | None = Field(default=None, alias="listeners")

class GetSongRecentListenersParams(RockskyModel):
    uri: str = Field(alias="uri")
    offset: int | None = Field(default=None, alias="offset")
    limit: int | None = Field(default=None, alias="limit")

class GetSongsByGenreOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    songs_by_genre: JsonValue | None = Field(default=None, alias="songsByGenre")

class GetSongsByGenreParams(RockskyModel):
    genre: str = Field(alias="genre")
    count: int | None = Field(default=None, alias="count")
    offset: int | None = Field(default=None, alias="offset")

class GetSongsOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")

class GetSongsParams(RockskyModel):
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    genre: str | None = Field(default=None, alias="genre")
    mbid: str | None = Field(default=None, alias="mbid")
    isrc: str | None = Field(default=None, alias="isrc")
    spotify_id: str | None = Field(default=None, alias="spotifyId")
    filter: str | None = Field(default=None, alias="filter")

class GetStarredOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    starred2: JsonValue | None = Field(default=None, alias="starred2")

class GetStarredParams(RockskyModel):
    pass

class GetStatsParams(RockskyModel):
    did: str = Field(alias="did")

class GetStoriesParams(RockskyModel):
    size: int | None = Field(default=None, alias="size")
    feed: str | None = Field(default=None, alias="feed")
    following: bool | None = Field(default=None, alias="following")

class GetStreamUrlOutput(RockskyModel):
    url: str = Field(alias="url")

class GetStreamUrlParams(RockskyModel):
    id: str = Field(alias="id")
    max_bit_rate: int | None = Field(default=None, alias="maxBitRate")
    format: str | None = Field(default=None, alias="format")

class GetTemporaryLinkParams(RockskyModel):
    path: str = Field(alias="path")

class GetTopArtistsOutput(RockskyModel):
    artists: list[ArtistViewBasic] | None = Field(default=None, alias="artists")

class GetTopArtistsParams(RockskyModel):
    did: str | None = Field(default=None, alias="did")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")

class GetTopScrobblersOutput(RockskyModel):
    scrobblers: list[ChartsScrobblerViewBasic] | None = Field(default=None, alias="scrobblers")

class GetTopScrobblersParams(RockskyModel):
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")

class GetTopSongsOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    top_songs: JsonValue | None = Field(default=None, alias="topSongs")

class GetTopSongsParams(RockskyModel):
    artist: str = Field(alias="artist")
    count: int | None = Field(default=None, alias="count")

class GetTopTracksOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")

class GetTopTracksParams(RockskyModel):
    did: str | None = Field(default=None, alias="did")
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")

class GetTrackShoutsOutput(RockskyModel):
    shouts: list[ShoutView] | None = Field(default=None, alias="shouts")

class GetTrackShoutsParams(RockskyModel):
    uri: str = Field(alias="uri")

class GetUnreadCountOutput(RockskyModel):
    count: int = Field(alias="count")

class GetUserOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    user: JsonValue | None = Field(default=None, alias="user")

class GetUserParams(RockskyModel):
    pass

class GetWrappedParams(RockskyModel):
    did: str = Field(alias="did")
    year: int | None = Field(default=None, alias="year")
    period: str | None = Field(default=None, alias="period")

class GoogledriveDownloadFileParams(RockskyModel):
    file_id: str = Field(alias="fileId")

class GoogledriveFileListView(RockskyModel):
    files: list[GoogledriveFileView] | None = Field(default=None, alias="files")
    directory: GoogledriveResponseDirectoryView | None = Field(default=None, alias="directory")
    parent_directory: GoogledriveResponseParentDirectoryView | None = Field(default=None, alias="parentDirectory")
    directories: list[GoogledriveResponseDirectoriesItemView] | None = Field(default=None, alias="directories")

class GoogledriveFileView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    file_id: str | None = Field(default=None, alias="fileId")
    directory_id: str | None = Field(default=None, alias="directoryId")
    track_id: str | None = Field(default=None, alias="trackId")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class GoogledriveGetFilesParams(RockskyModel):
    at: str | None = Field(default=None, alias="at")

class GoogledriveResponseDirectoriesItemView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    file_id: str | None = Field(default=None, alias="fileId")
    path: str | None = Field(default=None, alias="path")
    parent_id: str | None = Field(default=None, alias="parentId")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class GoogledriveResponseDirectoryView(RockskyModel):
    pass

class GoogledriveResponseParentDirectoryView(RockskyModel):
    pass

class GraphNotFoundActor(RockskyModel):
    actor: str = Field(alias="actor")
    not_found: bool = Field(alias="notFound")

class GraphRelationship(RockskyModel):
    did: str = Field(alias="did")
    following: str | None = Field(default=None, alias="following")
    followed_by: str | None = Field(default=None, alias="followedBy")

class InsertDirectoryParams(RockskyModel):
    uri: str = Field(alias="uri")
    directory: str = Field(alias="directory")
    position: int | None = Field(default=None, alias="position")

class InsertFilesParams(RockskyModel):
    uri: str = Field(alias="uri")
    files: list[str] = Field(alias="files")
    position: int | None = Field(default=None, alias="position")

class LibraryCreatePlaylistInput(RockskyModel):
    name: str = Field(alias="name")

class LibraryCreatePlaylistOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    playlist: JsonValue | None = Field(default=None, alias="playlist")
    atproto_error: str | None = Field(default=None, alias="atprotoError")

class LibraryGetAlbumOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    album: JsonValue | None = Field(default=None, alias="album")

class LibraryGetAlbumParams(RockskyModel):
    id: str = Field(alias="id")

class LibraryGetArtistOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    artist: JsonValue | None = Field(default=None, alias="artist")

class LibraryGetArtistParams(RockskyModel):
    id: str = Field(alias="id")

class LibraryGetArtistsOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    artists: JsonValue | None = Field(default=None, alias="artists")

class LibraryGetArtistsParams(RockskyModel):
    pass

class LibraryGetPlaylistOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    playlist: JsonValue | None = Field(default=None, alias="playlist")

class LibraryGetPlaylistParams(RockskyModel):
    id: str = Field(alias="id")

class LibraryGetPlaylistsOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    playlists: JsonValue | None = Field(default=None, alias="playlists")

class LibraryGetPlaylistsParams(RockskyModel):
    pass

class LibraryGetSongOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    song: JsonValue | None = Field(default=None, alias="song")

class LibraryGetSongParams(RockskyModel):
    id: str = Field(alias="id")

class LibrarySearchOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    search_result3: JsonValue | None = Field(default=None, alias="searchResult3")

class LibrarySearchParams(RockskyModel):
    query: str = Field(alias="query")
    artist_count: int | None = Field(default=None, alias="artistCount")
    artist_offset: int | None = Field(default=None, alias="artistOffset")
    album_count: int | None = Field(default=None, alias="albumCount")
    album_offset: int | None = Field(default=None, alias="albumOffset")
    song_count: int | None = Field(default=None, alias="songCount")
    song_offset: int | None = Field(default=None, alias="songOffset")

class LibraryUpdatePlaylistInput(RockskyModel):
    playlist_id: str = Field(alias="playlistId")
    name: str | None = Field(default=None, alias="name")
    comment: str | None = Field(default=None, alias="comment")
    song_id_to_add: str | None = Field(default=None, alias="songIdToAdd")
    song_index_to_remove: int | None = Field(default=None, alias="songIndexToRemove")

class LibraryUpdatePlaylistOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    atproto_error: str | None = Field(default=None, alias="atprotoError")

class LikeRecord(RockskyModel):
    created_at: str = Field(alias="createdAt")
    subject: StrongRef = Field(alias="subject")

class LikeShoutInput(RockskyModel):
    uri: str | None = Field(default=None, alias="uri")

class LikeSongInput(RockskyModel):
    uri: str | None = Field(default=None, alias="uri")

class ListNotificationsOutput(RockskyModel):
    notifications: list[NotificationView] = Field(alias="notifications")
    unread_count: int = Field(alias="unreadCount")
    cursor: str | None = Field(default=None, alias="cursor")

class ListNotificationsParams(RockskyModel):
    limit: int | None = Field(default=None, alias="limit")
    cursor: str | None = Field(default=None, alias="cursor")

class ListPresetsOutput(RockskyModel):
    presets: list[EqualizerPresetView] = Field(alias="presets")

class ListPresetsParams(RockskyModel):
    did: str | None = Field(default=None, alias="did")

class MatchSongParams(RockskyModel):
    title: str = Field(alias="title")
    artist: str = Field(alias="artist")
    album: str | None = Field(default=None, alias="album")
    mb_id: str | None = Field(default=None, alias="mbId")
    isrc: str | None = Field(default=None, alias="isrc")

class MirrorSourceView(RockskyModel):
    provider: str = Field(alias="provider")
    enabled: bool = Field(alias="enabled")
    push_enabled: bool | None = Field(default=None, alias="pushEnabled")
    external_username: str | None = Field(default=None, alias="externalUsername")
    has_credentials: bool = Field(alias="hasCredentials")
    last_polled_at: str | None = Field(default=None, alias="lastPolledAt")
    last_scrobble_seen_at: str | None = Field(default=None, alias="lastScrobbleSeenAt")

class NotificationActor(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")

class NotificationSubjectView(RockskyModel):
    uri: str = Field(alias="uri")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album_art: str | None = Field(default=None, alias="albumArt")

class NotificationView(RockskyModel):
    id: str = Field(alias="id")
    type_: str = Field(alias="type")
    read: bool = Field(alias="read")
    created_at: str = Field(alias="createdAt")
    subject_uri: str | None = Field(default=None, alias="subjectUri")
    shout_id: str | None = Field(default=None, alias="shoutId")
    shout_content: str | None = Field(default=None, alias="shoutContent")
    actor: NotificationActor | None = Field(default=None, alias="actor")
    subject: NotificationSubjectView | None = Field(default=None, alias="subject")

class PingOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")

class PingParams(RockskyModel):
    pass

class PlayDirectoryParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    directory_id: str = Field(alias="directoryId")
    shuffle: bool | None = Field(default=None, alias="shuffle")
    recurse: bool | None = Field(default=None, alias="recurse")
    position: int | None = Field(default=None, alias="position")

class PlayerCurrentlyPlayingViewDetailed(RockskyModel):
    title: str | None = Field(default=None, alias="title")
    device: JsonValue | None = Field(default=None, alias="device")
    shuffle_state: bool | None = Field(default=None, alias="shuffle_state")
    repeat_state: str | None = Field(default=None, alias="repeat_state")
    timestamp: int | None = Field(default=None, alias="timestamp")
    context: JsonValue | None = Field(default=None, alias="context")
    progress_ms: int | None = Field(default=None, alias="progress_ms")
    item: JsonValue | None = Field(default=None, alias="item")
    currently_playing_type: str | None = Field(default=None, alias="currently_playing_type")
    actions: JsonValue | None = Field(default=None, alias="actions")
    is_playing: bool | None = Field(default=None, alias="is_playing")
    uri: str | None = Field(default=None, alias="uri")
    album_uri: str | None = Field(default=None, alias="albumUri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    liked: bool | None = Field(default=None, alias="liked")

class PlayerGetCurrentlyPlayingParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    actor: str | None = Field(default=None, alias="actor")

class PlayerNextParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")

class PlayerPauseParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")

class PlayerPlaybackQueueViewDetailed(RockskyModel):
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")

class PlayerPlayParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")

class PlayerPreviousParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")

class PlayerSeekParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    position: int = Field(alias="position")

class PlayFileParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    file_id: str = Field(alias="fileId")

class PlaylistCreatePlaylistOutput(RockskyModel):
    uri: str = Field(alias="uri")
    cid: str = Field(alias="cid")

class PlaylistCreatePlaylistParams(RockskyModel):
    name: str = Field(alias="name")
    description: str | None = Field(default=None, alias="description")
    picture_url: str | None = Field(default=None, alias="pictureUrl")

class PlaylistGetPlaylistParams(RockskyModel):
    uri: str = Field(alias="uri")
    filter: str | None = Field(default=None, alias="filter")

class PlaylistGetPlaylistsOutput(RockskyModel):
    playlists: list[PlaylistViewBasic] | None = Field(default=None, alias="playlists")

class PlaylistGetPlaylistsParams(RockskyModel):
    limit: int | None = Field(default=None, alias="limit")
    offset: int | None = Field(default=None, alias="offset")
    filter: str | None = Field(default=None, alias="filter")

class PlaylistRecord(RockskyModel):
    name: str = Field(alias="name")
    description: str | None = Field(default=None, alias="description")
    picture: BlobRef | None = Field(default=None, alias="picture")
    picture_url: str | None = Field(default=None, alias="pictureUrl")
    created_at: str = Field(alias="createdAt")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")

class PlaylistSongRecord(RockskyModel):
    playlist: StrongRef = Field(alias="playlist")
    song: StrongRef = Field(alias="song")
    title: str = Field(alias="title")
    artist: str = Field(alias="artist")
    album: str = Field(alias="album")
    album_artist: str = Field(alias="albumArtist")
    duration: int = Field(alias="duration")
    album_art_url: str | None = Field(default=None, alias="albumArtUrl")
    added_at: str = Field(alias="addedAt")

class PlaylistUpdatePlaylistOutput(RockskyModel):
    uri: str = Field(alias="uri")
    cid: str = Field(alias="cid")

class PlaylistUpdatePlaylistParams(RockskyModel):
    uri: str = Field(alias="uri")
    name: str | None = Field(default=None, alias="name")
    description: str | None = Field(default=None, alias="description")
    picture_url: str | None = Field(default=None, alias="pictureUrl")

class PlaylistViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    uri: str | None = Field(default=None, alias="uri")
    curator_did: str | None = Field(default=None, alias="curatorDid")
    curator_handle: str | None = Field(default=None, alias="curatorHandle")
    curator_name: str | None = Field(default=None, alias="curatorName")
    curator_avatar_url: str | None = Field(default=None, alias="curatorAvatarUrl")
    description: str | None = Field(default=None, alias="description")
    cover_image_url: str | None = Field(default=None, alias="coverImageUrl")
    created_at: str | None = Field(default=None, alias="createdAt")
    track_count: int | None = Field(default=None, alias="trackCount")
    track_arts: list[str] | None = Field(default=None, alias="trackArts")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    curator_d_id: str | None = Field(default=None, alias="curatorDId")

class PlaylistViewDetailed(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    uri: str | None = Field(default=None, alias="uri")
    curator_did: str | None = Field(default=None, alias="curatorDid")
    curator_handle: str | None = Field(default=None, alias="curatorHandle")
    curator_name: str | None = Field(default=None, alias="curatorName")
    curator_avatar_url: str | None = Field(default=None, alias="curatorAvatarUrl")
    description: str | None = Field(default=None, alias="description")
    cover_image_url: str | None = Field(default=None, alias="coverImageUrl")
    created_at: str | None = Field(default=None, alias="createdAt")
    tracks: list[SongViewBasic] | None = Field(default=None, alias="tracks")
    curator_d_id: str | None = Field(default=None, alias="curatorDId")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    track_count: int | None = Field(default=None, alias="trackCount")

class ProfileRecord(RockskyModel):
    display_name: str | None = Field(default=None, alias="displayName")
    description: str | None = Field(default=None, alias="description")
    avatar: BlobRef | None = Field(default=None, alias="avatar")
    banner: BlobRef | None = Field(default=None, alias="banner")
    labels: JsonValue | None = Field(default=None, alias="labels")
    joined_via_starter_pack: StrongRef | None = Field(default=None, alias="joinedViaStarterPack")
    created_at: str | None = Field(default=None, alias="createdAt")

class PutAudioSettingsInput(RockskyModel):
    crossfade: RockboxCrossfadeSettings | None = Field(default=None, alias="crossfade")
    equalizer: RockboxEqualizerSettings | None = Field(default=None, alias="equalizer")
    replay_gain: RockboxReplayGainSettings | None = Field(default=None, alias="replayGain")
    tone: RockboxToneSettings | None = Field(default=None, alias="tone")

class PutMirrorSourceInput(RockskyModel):
    provider: str = Field(alias="provider")
    enabled: bool | None = Field(default=None, alias="enabled")
    push_enabled: bool | None = Field(default=None, alias="pushEnabled")
    external_username: str | None = Field(default=None, alias="externalUsername")
    api_key: str | None = Field(default=None, alias="apiKey")

class PutPresetInput(RockskyModel):
    name: str = Field(alias="name")
    precut: int | None = Field(default=None, alias="precut")
    bands: list[RockboxEqualizerBand] = Field(alias="bands")

class RadioRecord(RockskyModel):
    name: str = Field(alias="name")
    url: str = Field(alias="url")
    description: str | None = Field(default=None, alias="description")
    genre: str | None = Field(default=None, alias="genre")
    logo: BlobRef | None = Field(default=None, alias="logo")
    website: str | None = Field(default=None, alias="website")
    created_at: str = Field(alias="createdAt")

class RadioViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    description: str | None = Field(default=None, alias="description")
    created_at: str | None = Field(default=None, alias="createdAt")

class RadioViewDetailed(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    description: str | None = Field(default=None, alias="description")
    website: str | None = Field(default=None, alias="website")
    url: str | None = Field(default=None, alias="url")
    genre: str | None = Field(default=None, alias="genre")
    logo: str | None = Field(default=None, alias="logo")
    created_at: str | None = Field(default=None, alias="createdAt")

class RemoveApikeyParams(RockskyModel):
    id: str = Field(alias="id")

class RemovePlaylistParams(RockskyModel):
    uri: str = Field(alias="uri")

class RemoveShoutParams(RockskyModel):
    id: str = Field(alias="id")

class RemoveTrackParams(RockskyModel):
    uri: str = Field(alias="uri")
    song_uri: str | None = Field(default=None, alias="songUri")
    index: int | None = Field(default=None, alias="index")

class ReplyShoutInput(RockskyModel):
    shout_id: str = Field(alias="shoutId")
    message: str = Field(alias="message")

class ReportShoutInput(RockskyModel):
    shout_id: str = Field(alias="shoutId")
    reason: str | None = Field(default=None, alias="reason")

class RockboxCrossfadeSettings(RockskyModel):
    mode: str | None = Field(default=None, alias="mode")
    fade_in_delay: int | None = Field(default=None, alias="fadeInDelay")
    fade_in_duration: int | None = Field(default=None, alias="fadeInDuration")
    fade_out_delay: int | None = Field(default=None, alias="fadeOutDelay")
    fade_out_duration: int | None = Field(default=None, alias="fadeOutDuration")
    fade_out_mix_mode: str | None = Field(default=None, alias="fadeOutMixMode")

class RockboxEqualizerBand(RockskyModel):
    frequency: int = Field(alias="frequency")
    gain: int = Field(alias="gain")
    q: int = Field(alias="q")

class RockboxEqualizerSettings(RockskyModel):
    enabled: bool | None = Field(default=None, alias="enabled")
    precut: int | None = Field(default=None, alias="precut")
    bands: list[RockboxEqualizerBand] | None = Field(default=None, alias="bands")

class RockboxReplayGainSettings(RockskyModel):
    mode: str | None = Field(default=None, alias="mode")
    preamp: int | None = Field(default=None, alias="preamp")
    prevent_clipping: bool | None = Field(default=None, alias="preventClipping")

class RockboxSettingsView(RockskyModel):
    crossfade: RockboxCrossfadeSettings | None = Field(default=None, alias="crossfade")
    equalizer: RockboxEqualizerSettings | None = Field(default=None, alias="equalizer")
    replay_gain: RockboxReplayGainSettings | None = Field(default=None, alias="replayGain")
    tone: RockboxToneSettings | None = Field(default=None, alias="tone")
    created_at: str = Field(alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class RockboxToneSettings(RockskyModel):
    bass: int | None = Field(default=None, alias="bass")
    treble: int | None = Field(default=None, alias="treble")
    balance: int | None = Field(default=None, alias="balance")
    channels: str | None = Field(default=None, alias="channels")

class SavePlayQueueInput(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    current: str | None = Field(default=None, alias="current")
    position: int | None = Field(default=None, alias="position")

class SavePlayQueueOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")

class ScrobbleFirstScrobbleView(RockskyModel):
    handle: str | None = Field(default=None, alias="handle")
    avatar: str | None = Field(default=None, alias="avatar")
    timestamp: str | None = Field(default=None, alias="timestamp")

class ScrobbleInput(RockskyModel):
    id: str = Field(alias="id")
    time: int | None = Field(default=None, alias="time")
    submission: bool | None = Field(default=None, alias="submission")

class ScrobbleOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")

class ScrobbleRecord(RockskyModel):
    title: str = Field(alias="title")
    artist: str = Field(alias="artist")
    artists: list[ArtistMbid] | None = Field(default=None, alias="artists")
    album_artist: str = Field(alias="albumArtist")
    album: str = Field(alias="album")
    duration: int = Field(alias="duration")
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    release_date: str | None = Field(default=None, alias="releaseDate")
    year: int | None = Field(default=None, alias="year")
    genre: str | None = Field(default=None, alias="genre")
    tags: list[str] | None = Field(default=None, alias="tags")
    composer: str | None = Field(default=None, alias="composer")
    lyrics: str | None = Field(default=None, alias="lyrics")
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    wiki: str | None = Field(default=None, alias="wiki")
    album_art: BlobRef | None = Field(default=None, alias="albumArt")
    album_art_url: str | None = Field(default=None, alias="albumArtUrl")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    created_at: str = Field(alias="createdAt")
    mbid: str | None = Field(default=None, alias="mbid")
    label: str | None = Field(default=None, alias="label")
    isrc: str | None = Field(default=None, alias="isrc")

class ScrobbleViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    track_id: str | None = Field(default=None, alias="trackId")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album: str | None = Field(default=None, alias="album")
    album_uri: str | None = Field(default=None, alias="albumUri")
    album_art: str | None = Field(default=None, alias="albumArt")
    track_uri: str | None = Field(default=None, alias="trackUri")
    handle: str | None = Field(default=None, alias="handle")
    did: str | None = Field(default=None, alias="did")
    avatar: str | None = Field(default=None, alias="avatar")
    created_at: str | None = Field(default=None, alias="createdAt")
    uri: str | None = Field(default=None, alias="uri")
    sha256: str | None = Field(default=None, alias="sha256")
    liked: bool | None = Field(default=None, alias="liked")
    likes_count: int | None = Field(default=None, alias="likesCount")
    cover: str | None = Field(default=None, alias="cover")
    date: str | None = Field(default=None, alias="date")
    user: str | None = Field(default=None, alias="user")
    user_display_name: str | None = Field(default=None, alias="userDisplayName")
    user_avatar: str | None = Field(default=None, alias="userAvatar")
    tags: list[str] | None = Field(default=None, alias="tags")
    mb_id: str | None = Field(default=None, alias="mbId")
    mbid: str | None = Field(default=None, alias="mbid")
    isrc: str | None = Field(default=None, alias="isrc")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    composer: str | None = Field(default=None, alias="composer")
    track_number: int | None = Field(default=None, alias="trackNumber")
    duration: int | None = Field(default=None, alias="duration")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    disc_number: int | None = Field(default=None, alias="discNumber")
    genre: str | None = Field(default=None, alias="genre")
    label: str | None = Field(default=None, alias="label")
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    key: str | None = Field(default=None, alias="key")
    xata_version: int | None = Field(default=None, alias="xataVersion")
    bpm: float | None = Field(default=None, alias="bpm")
    updated_at: JsonValue | None = Field(default=None, alias="updatedAt")

class ScrobbleViewDetailed(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    user: str | None = Field(default=None, alias="user")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    album: str | None = Field(default=None, alias="album")
    album_uri: str | None = Field(default=None, alias="albumUri")
    cover: str | None = Field(default=None, alias="cover")
    date: str | None = Field(default=None, alias="date")
    uri: str | None = Field(default=None, alias="uri")
    sha256: str | None = Field(default=None, alias="sha256")
    liked: bool | None = Field(default=None, alias="liked")
    track_uri: str | None = Field(default=None, alias="trackUri")
    likes_count: int | None = Field(default=None, alias="likesCount")
    listeners: int | None = Field(default=None, alias="listeners")
    scrobbles: int | None = Field(default=None, alias="scrobbles")
    artists: list[ArtistViewBasic] | None = Field(default=None, alias="artists")
    first_scrobble: ScrobbleFirstScrobbleView | None = Field(default=None, alias="firstScrobble")
    mb_id: str | None = Field(default=None, alias="mbId")
    isrc: str | None = Field(default=None, alias="isrc")
    tags: list[str] | None = Field(default=None, alias="tags")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    album_artist: str | None = Field(default=None, alias="albumArtist")
    track_number: int | None = Field(default=None, alias="trackNumber")
    duration: int | None = Field(default=None, alias="duration")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    disc_number: int | None = Field(default=None, alias="discNumber")
    lyrics: str | None = Field(default=None, alias="lyrics")
    composer: str | None = Field(default=None, alias="composer")
    genre: str | None = Field(default=None, alias="genre")
    label: str | None = Field(default=None, alias="label")
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    key: str | None = Field(default=None, alias="key")
    acoustid_fingerprint: str | None = Field(default=None, alias="acoustidFingerprint")
    xata_version: int | None = Field(default=None, alias="xataVersion")
    mbid: str | None = Field(default=None, alias="mbid")
    bpm: float | None = Field(default=None, alias="bpm")

class SettingsRecord(RockskyModel):
    crossfade: RockboxCrossfadeSettings | None = Field(default=None, alias="crossfade")
    equalizer: RockboxEqualizerSettings | None = Field(default=None, alias="equalizer")
    replay_gain: RockboxReplayGainSettings | None = Field(default=None, alias="replayGain")
    tone: RockboxToneSettings | None = Field(default=None, alias="tone")
    created_at: str = Field(alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

class ShoutAuthor(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")

class ShoutGif(RockskyModel):
    url: str = Field(alias="url")
    preview_url: str | None = Field(default=None, alias="previewUrl")
    alt: str | None = Field(default=None, alias="alt")
    width: int | None = Field(default=None, alias="width")
    height: int | None = Field(default=None, alias="height")

class ShoutMention(RockskyModel):
    did: str = Field(alias="did")
    byte_start: int = Field(alias="byteStart")
    byte_end: int = Field(alias="byteEnd")

class ShoutRecord(RockskyModel):
    message: str | None = Field(default=None, alias="message")
    created_at: str = Field(alias="createdAt")
    parent: StrongRef | None = Field(default=None, alias="parent")
    subject: StrongRef = Field(alias="subject")
    gif: ShoutGif | None = Field(default=None, alias="gif")
    facets: list[ShoutMention] | None = Field(default=None, alias="facets")

class ShoutView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    message: str | None = Field(default=None, alias="message")
    parent: str | None = Field(default=None, alias="parent")
    created_at: str | None = Field(default=None, alias="createdAt")
    author: ShoutAuthor | None = Field(default=None, alias="author")
    gif: ShoutGif | None = Field(default=None, alias="gif")
    facets: list[ShoutMention] | None = Field(default=None, alias="facets")
    content: str | None = Field(default=None, alias="content")
    uri: str | None = Field(default=None, alias="uri")
    likes: int | None = Field(default=None, alias="likes")
    liked: bool | None = Field(default=None, alias="liked")

class SongFirstScrobbleView(RockskyModel):
    handle: str | None = Field(default=None, alias="handle")
    avatar: str | None = Field(default=None, alias="avatar")
    timestamp: str | None = Field(default=None, alias="timestamp")

class SongGetSongParams(RockskyModel):
    uri: str | None = Field(default=None, alias="uri")
    mbid: str | None = Field(default=None, alias="mbid")
    isrc: str | None = Field(default=None, alias="isrc")
    spotify_id: str | None = Field(default=None, alias="spotifyId")

class SongMatchView(RockskyModel):
    id: int | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album: str | None = Field(default=None, alias="album")
    album_art: str | None = Field(default=None, alias="albumArt")
    isrc: str | None = Field(default=None, alias="isrc")
    duration_ms: int | None = Field(default=None, alias="durationMs")
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    link: str | None = Field(default=None, alias="link")
    preview: str | None = Field(default=None, alias="preview")
    rank: int | None = Field(default=None, alias="rank")
    explicit: bool | None = Field(default=None, alias="explicit")
    score: int | None = Field(default=None, alias="score")

class SongRecentListenerView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    did: str | None = Field(default=None, alias="did")
    handle: str | None = Field(default=None, alias="handle")
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = Field(default=None, alias="avatar")
    timestamp: str | None = Field(default=None, alias="timestamp")
    scrobble_uri: str | None = Field(default=None, alias="scrobbleUri")

class SongRecord(RockskyModel):
    title: str = Field(alias="title")
    artist: str = Field(alias="artist")
    artists: list[ArtistMbid] | None = Field(default=None, alias="artists")
    album_artist: str = Field(alias="albumArtist")
    album: str = Field(alias="album")
    duration: int = Field(alias="duration")
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    release_date: str | None = Field(default=None, alias="releaseDate")
    year: int | None = Field(default=None, alias="year")
    genre: str | None = Field(default=None, alias="genre")
    tags: list[str] | None = Field(default=None, alias="tags")
    composer: str | None = Field(default=None, alias="composer")
    lyrics: str | None = Field(default=None, alias="lyrics")
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    wiki: str | None = Field(default=None, alias="wiki")
    album_art: BlobRef | None = Field(default=None, alias="albumArt")
    album_art_url: str | None = Field(default=None, alias="albumArtUrl")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    created_at: str = Field(alias="createdAt")
    mbid: str | None = Field(default=None, alias="mbid")
    label: str | None = Field(default=None, alias="label")
    isrc: str | None = Field(default=None, alias="isrc")

class SongResponseMbArtistsItemView(RockskyModel):
    mbid: str | None = Field(default=None, alias="mbid")
    name: str | None = Field(default=None, alias="name")

class SongViewBasic(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = Field(default=None, alias="uri")
    album: str | None = Field(default=None, alias="album")
    duration: int | None = Field(default=None, alias="duration")
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    play_count: int | None = Field(default=None, alias="playCount")
    likes_count: int | None = Field(default=None, alias="likesCount")
    liked: bool | None = Field(default=None, alias="liked")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    album_uri: str | None = Field(default=None, alias="albumUri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    sha256: str | None = Field(default=None, alias="sha256")
    mbid: str | None = Field(default=None, alias="mbid")
    isrc: str | None = Field(default=None, alias="isrc")
    tags: list[str] | None = Field(default=None, alias="tags")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    mb_id: str | None = Field(default=None, alias="mbId")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    lyrics: str | None = Field(default=None, alias="lyrics")
    composer: str | None = Field(default=None, alias="composer")
    genre: str | None = Field(default=None, alias="genre")
    label: str | None = Field(default=None, alias="label")
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    key: str | None = Field(default=None, alias="key")
    acoustid_fingerprint: str | None = Field(default=None, alias="acoustidFingerprint")
    xata_version: int | None = Field(default=None, alias="xataVersion")
    bpm: float | None = Field(default=None, alias="bpm")

class SongViewDetailed(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = Field(default=None, alias="uri")
    album: str | None = Field(default=None, alias="album")
    duration: int | None = Field(default=None, alias="duration")
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    play_count: int | None = Field(default=None, alias="playCount")
    likes_count: int | None = Field(default=None, alias="likesCount")
    liked: bool | None = Field(default=None, alias="liked")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    album_uri: str | None = Field(default=None, alias="albumUri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    sha256: str | None = Field(default=None, alias="sha256")
    mbid: str | None = Field(default=None, alias="mbid")
    isrc: str | None = Field(default=None, alias="isrc")
    tags: list[str] | None = Field(default=None, alias="tags")
    created_at: str | None = Field(default=None, alias="createdAt")
    artists: list[ArtistViewBasic] | None = Field(default=None, alias="artists")
    first_scrobble: SongFirstScrobbleView | None = Field(default=None, alias="firstScrobble")
    matches: list[SongMatchView] | None = Field(default=None, alias="matches")
    mb_id: str | None = Field(default=None, alias="mbId")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    release_date: str | None = Field(default=None, alias="releaseDate")
    year: int | None = Field(default=None, alias="year")
    artist_picture: str | None = Field(default=None, alias="artistPicture")
    genres: list[str] | None = Field(default=None, alias="genres")
    mb_artists: list[SongResponseMbArtistsItemView] | None = Field(default=None, alias="mbArtists")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    lyrics: str | None = Field(default=None, alias="lyrics")
    composer: str | None = Field(default=None, alias="composer")
    genre: str | None = Field(default=None, alias="genre")
    label: str | None = Field(default=None, alias="label")
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    key: str | None = Field(default=None, alias="key")
    acoustid_fingerprint: str | None = Field(default=None, alias="acoustidFingerprint")
    xata_version: int | None = Field(default=None, alias="xataVersion")
    bpm: float | None = Field(default=None, alias="bpm")

class SpotifyGetCurrentlyPlayingParams(RockskyModel):
    actor: str | None = Field(default=None, alias="actor")

class SpotifySeekParams(RockskyModel):
    position: int = Field(alias="position")

class SpotifyTrackView(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    artist: str | None = Field(default=None, alias="artist")
    album: str | None = Field(default=None, alias="album")
    duration: int | None = Field(default=None, alias="duration")
    preview_url: str | None = Field(default=None, alias="previewUrl")

class StarInput(RockskyModel):
    id: str = Field(alias="id")
    album_id: str | None = Field(default=None, alias="albumId")
    artist_id: str | None = Field(default=None, alias="artistId")

class StarOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")

class StartPlaylistParams(RockskyModel):
    uri: str = Field(alias="uri")
    shuffle: bool | None = Field(default=None, alias="shuffle")
    position: int | None = Field(default=None, alias="position")

class StartScanOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")
    scan_status: JsonValue | None = Field(default=None, alias="scanStatus")

class StartScanParams(RockskyModel):
    pass

class StatsGlobalStatsView(RockskyModel):
    scrobbles: int | None = Field(default=None, alias="scrobbles")
    users: int | None = Field(default=None, alias="users")
    artists: int | None = Field(default=None, alias="artists")
    albums: int | None = Field(default=None, alias="albums")
    tracks: int | None = Field(default=None, alias="tracks")

class StatsView(RockskyModel):
    scrobbles: int | None = Field(default=None, alias="scrobbles")
    artists: int | None = Field(default=None, alias="artists")
    loved_tracks: int | None = Field(default=None, alias="lovedTracks")
    albums: int | None = Field(default=None, alias="albums")
    tracks: int | None = Field(default=None, alias="tracks")

class StatsWrappedAlbum(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = Field(default=None, alias="uri")
    play_count: int | None = Field(default=None, alias="playCount")

class StatsWrappedArtist(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    name: str | None = Field(default=None, alias="name")
    picture: str | None = Field(default=None, alias="picture")
    uri: str | None = Field(default=None, alias="uri")
    play_count: int | None = Field(default=None, alias="playCount")

class StatsWrappedDayCount(RockskyModel):
    date: str | None = Field(default=None, alias="date")
    count: int | None = Field(default=None, alias="count")

class StatsWrappedGenreCount(RockskyModel):
    genre: str | None = Field(default=None, alias="genre")
    count: int | None = Field(default=None, alias="count")

class StatsWrappedMilestone(RockskyModel):
    track_title: str | None = Field(default=None, alias="trackTitle")
    artist_name: str | None = Field(default=None, alias="artistName")
    timestamp: str | None = Field(default=None, alias="timestamp")
    track_uri: str | None = Field(default=None, alias="trackUri")

class StatsWrappedMonthCount(RockskyModel):
    month: int | None = Field(default=None, alias="month")
    count: int | None = Field(default=None, alias="count")

class StatsWrappedTrack(RockskyModel):
    id: str | None = Field(default=None, alias="id")
    title: str | None = Field(default=None, alias="title")
    artist: str | None = Field(default=None, alias="artist")
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = Field(default=None, alias="uri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    album_uri: str | None = Field(default=None, alias="albumUri")
    play_count: int | None = Field(default=None, alias="playCount")

class StatsWrappedView(RockskyModel):
    year: int | None = Field(default=None, alias="year")
    period: str | None = Field(default=None, alias="period")
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    total_scrobbles: int | None = Field(default=None, alias="totalScrobbles")
    total_listening_time_minutes: int | None = Field(default=None, alias="totalListeningTimeMinutes")
    top_artists: list[StatsWrappedArtist] | None = Field(default=None, alias="topArtists")
    top_tracks: list[StatsWrappedTrack] | None = Field(default=None, alias="topTracks")
    top_albums: list[StatsWrappedAlbum] | None = Field(default=None, alias="topAlbums")
    top_genres: list[StatsWrappedGenreCount] | None = Field(default=None, alias="topGenres")
    scrobbles_per_month: list[StatsWrappedMonthCount] | None = Field(default=None, alias="scrobblesPerMonth")
    scrobbles_per_day: list[StatsWrappedDayCount] | None = Field(default=None, alias="scrobblesPerDay")
    most_active_day: StatsWrappedDayCount | None = Field(default=None, alias="mostActiveDay")
    most_active_hour: int | None = Field(default=None, alias="mostActiveHour")
    new_artists_count: int | None = Field(default=None, alias="newArtistsCount")
    longest_streak: int | None = Field(default=None, alias="longestStreak")
    first_scrobble: StatsWrappedMilestone | None = Field(default=None, alias="firstScrobble")
    last_scrobble: StatsWrappedMilestone | None = Field(default=None, alias="lastScrobble")

class StatusRecord(RockskyModel):
    track: ActorTrackView = Field(alias="track")
    started_at: str = Field(alias="startedAt")
    expires_at: str | None = Field(default=None, alias="expiresAt")

class StrongRef(RockskyModel):
    uri: str = Field(alias="uri")
    cid: str = Field(alias="cid")

class UnfollowAccountOutput(RockskyModel):
    subject: ActorProfileViewBasic = Field(alias="subject")
    followers: list[ActorProfileViewBasic] = Field(alias="followers")
    cursor: str | None = Field(default=None, alias="cursor")

class UnfollowAccountParams(RockskyModel):
    account: str = Field(alias="account")

class UnstarInput(RockskyModel):
    id: str = Field(alias="id")
    album_id: str | None = Field(default=None, alias="albumId")
    artist_id: str | None = Field(default=None, alias="artistId")

class UnstarOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")

class UpdateApikeyInput(RockskyModel):
    id: str = Field(alias="id")
    name: str = Field(alias="name")
    description: str | None = Field(default=None, alias="description")

class UpdateNowPlayingInput(RockskyModel):
    id: str = Field(alias="id")

class UpdateNowPlayingOutput(RockskyModel):
    status: str | None = Field(default=None, alias="status")
    version: str | None = Field(default=None, alias="version")
    type_: str | None = Field(default=None, alias="type")
    server_version: str | None = Field(default=None, alias="serverVersion")
    open_subsonic: bool | None = Field(default=None, alias="openSubsonic")

class UpdateSeenInput(RockskyModel):
    ids: list[str] | None = Field(default=None, alias="ids")

class UpdateSeenOutput(RockskyModel):
    unread_count: int = Field(alias="unreadCount")

ActorArtistViewBasic.model_rebuild()
ActorCompatibilityViewBasic.model_rebuild()
ActorNeighbourViewBasic.model_rebuild()
ActorProfileViewBasic.model_rebuild()
ActorProfileViewDetailed.model_rebuild()
ActorResponseDropboxView.model_rebuild()
ActorResponseGoogledriveView.model_rebuild()
ActorResponseSpotifyUserView.model_rebuild()
ActorTrackView.model_rebuild()
AddDirectoryToQueueParams.model_rebuild()
AddItemsToQueueParams.model_rebuild()
AddSongsOutput.model_rebuild()
AddSongsParams.model_rebuild()
AlbumDiscogsArtistView.model_rebuild()
AlbumDiscogsCreditView.model_rebuild()
AlbumDiscogsIdentifierView.model_rebuild()
AlbumDiscogsLabelView.model_rebuild()
AlbumDiscogsMasterView.model_rebuild()
AlbumDiscogsTrackView.model_rebuild()
AlbumDiscogsView.model_rebuild()
AlbumGetAlbumParams.model_rebuild()
AlbumRecord.model_rebuild()
AlbumViewBasic.model_rebuild()
AlbumViewDetailed.model_rebuild()
ApiKeyView.model_rebuild()
ArtistGetArtistParams.model_rebuild()
ArtistGetArtistsOutput.model_rebuild()
ArtistGetArtistsParams.model_rebuild()
ArtistListenerViewBasic.model_rebuild()
ArtistMbid.model_rebuild()
ArtistRecentListenerView.model_rebuild()
ArtistRecord.model_rebuild()
ArtistSongViewBasic.model_rebuild()
ArtistViewBasic.model_rebuild()
ArtistViewDetailed.model_rebuild()
ChartsDecadeViewBasic.model_rebuild()
ChartsScrobblerViewBasic.model_rebuild()
ChartsScrobbleViewBasic.model_rebuild()
ChartsView.model_rebuild()
CreateApikeyInput.model_rebuild()
CreateScrobbleInput.model_rebuild()
CreateShoutInput.model_rebuild()
CreateSongInput.model_rebuild()
DeleteAlbumInput.model_rebuild()
DeleteAlbumOutput.model_rebuild()
DeletePlaylistInput.model_rebuild()
DeletePlaylistOutput.model_rebuild()
DeletePresetParams.model_rebuild()
DeleteSongInput.model_rebuild()
DeleteSongOutput.model_rebuild()
DescribeFeedGeneratorOutput.model_rebuild()
DislikeShoutInput.model_rebuild()
DislikeSongInput.model_rebuild()
DropboxDownloadFileParams.model_rebuild()
DropboxFileListView.model_rebuild()
DropboxFileView.model_rebuild()
DropboxGetFilesParams.model_rebuild()
DropboxResponseDirectoriesItemView.model_rebuild()
DropboxResponseDirectoryView.model_rebuild()
DropboxResponseParentDirectoryView.model_rebuild()
DropboxTemporaryLinkView.model_rebuild()
EqualizerPresetView.model_rebuild()
EqualizerRecord.model_rebuild()
FeedGeneratorsView.model_rebuild()
FeedGeneratorView.model_rebuild()
FeedItemView.model_rebuild()
FeedRecommendationsView.model_rebuild()
FeedRecommendationView.model_rebuild()
FeedRecommendedAlbumsView.model_rebuild()
FeedRecommendedAlbumView.model_rebuild()
FeedRecommendedArtistsView.model_rebuild()
FeedRecommendedArtistView.model_rebuild()
FeedSearchFederation.model_rebuild()
FeedSearchHit.model_rebuild()
FeedSearchParams.model_rebuild()
FeedSearchResultsView.model_rebuild()
FeedStoriesView.model_rebuild()
FeedStoryView.model_rebuild()
FeedUriView.model_rebuild()
FeedView.model_rebuild()
FollowAccountOutput.model_rebuild()
FollowAccountParams.model_rebuild()
FollowRecord.model_rebuild()
GeneratorRecord.model_rebuild()
GetActorAlbumsOutput.model_rebuild()
GetActorAlbumsParams.model_rebuild()
GetActorArtistsOutput.model_rebuild()
GetActorArtistsParams.model_rebuild()
GetActorCompatibilityOutput.model_rebuild()
GetActorCompatibilityParams.model_rebuild()
GetActorLovedSongsOutput.model_rebuild()
GetActorLovedSongsParams.model_rebuild()
GetActorNeighboursOutput.model_rebuild()
GetActorNeighboursParams.model_rebuild()
GetActorPlaylistsOutput.model_rebuild()
GetActorPlaylistsParams.model_rebuild()
GetActorScrobblesOutput.model_rebuild()
GetActorScrobblesParams.model_rebuild()
GetActorSongsOutput.model_rebuild()
GetActorSongsParams.model_rebuild()
GetAlbumInfoOutput.model_rebuild()
GetAlbumInfoParams.model_rebuild()
GetAlbumListOutput.model_rebuild()
GetAlbumListParams.model_rebuild()
GetAlbumRecommendationsParams.model_rebuild()
GetAlbumShoutsOutput.model_rebuild()
GetAlbumShoutsParams.model_rebuild()
GetAlbumsOutput.model_rebuild()
GetAlbumsParams.model_rebuild()
GetAlbumTracksOutput.model_rebuild()
GetAlbumTracksParams.model_rebuild()
GetApikeysOutput.model_rebuild()
GetApikeysParams.model_rebuild()
GetArtistAlbumsOutput.model_rebuild()
GetArtistAlbumsParams.model_rebuild()
GetArtistInfoOutput.model_rebuild()
GetArtistInfoParams.model_rebuild()
GetArtistListenersOutput.model_rebuild()
GetArtistListenersParams.model_rebuild()
GetArtistRecentListenersOutput.model_rebuild()
GetArtistRecentListenersParams.model_rebuild()
GetArtistRecommendationsParams.model_rebuild()
GetArtistShoutsOutput.model_rebuild()
GetArtistShoutsParams.model_rebuild()
GetArtistTracksOutput.model_rebuild()
GetArtistTracksParams.model_rebuild()
GetAudioSettingsParams.model_rebuild()
GetCoverArtUrlOutput.model_rebuild()
GetCoverArtUrlParams.model_rebuild()
GetDecadesOutput.model_rebuild()
GetDecadesParams.model_rebuild()
GetDownloadUrlOutput.model_rebuild()
GetDownloadUrlParams.model_rebuild()
GetFeedGeneratorOutput.model_rebuild()
GetFeedGeneratorParams.model_rebuild()
GetFeedGeneratorsParams.model_rebuild()
GetFeedParams.model_rebuild()
GetFeedSkeletonOutput.model_rebuild()
GetFeedSkeletonParams.model_rebuild()
GetFileParams.model_rebuild()
GetFollowersOutput.model_rebuild()
GetFollowersParams.model_rebuild()
GetFollowsOutput.model_rebuild()
GetFollowsParams.model_rebuild()
GetGenresOutput.model_rebuild()
GetGenresParams.model_rebuild()
GetGlobalStatsParams.model_rebuild()
GetIndexesOutput.model_rebuild()
GetIndexesParams.model_rebuild()
GetInternetRadioStationsOutput.model_rebuild()
GetInternetRadioStationsParams.model_rebuild()
GetKnownFollowersOutput.model_rebuild()
GetKnownFollowersParams.model_rebuild()
GetLicenseOutput.model_rebuild()
GetLicenseParams.model_rebuild()
GetLyricsOutput.model_rebuild()
GetLyricsParams.model_rebuild()
GetMetadataOutput.model_rebuild()
GetMetadataParams.model_rebuild()
GetMirrorSourcesOutput.model_rebuild()
GetMirrorSourcesParams.model_rebuild()
GetMusicDirectoryOutput.model_rebuild()
GetMusicDirectoryParams.model_rebuild()
GetMusicFoldersOutput.model_rebuild()
GetMusicFoldersParams.model_rebuild()
GetNowPlayingOutput.model_rebuild()
GetNowPlayingParams.model_rebuild()
GetPlaybackQueueParams.model_rebuild()
GetPlayQueueOutput.model_rebuild()
GetPlayQueueParams.model_rebuild()
GetProfileParams.model_rebuild()
GetProfileShoutsOutput.model_rebuild()
GetProfileShoutsParams.model_rebuild()
GetRandomSongsOutput.model_rebuild()
GetRandomSongsParams.model_rebuild()
GetRecommendationsParams.model_rebuild()
GetScanStatusOutput.model_rebuild()
GetScanStatusParams.model_rebuild()
GetScrobbleParams.model_rebuild()
GetScrobblesChartParams.model_rebuild()
GetScrobblesOutput.model_rebuild()
GetScrobblesParams.model_rebuild()
GetShoutRepliesOutput.model_rebuild()
GetShoutRepliesParams.model_rebuild()
GetSimilarSongsOutput.model_rebuild()
GetSimilarSongsParams.model_rebuild()
GetSongRecentListenersOutput.model_rebuild()
GetSongRecentListenersParams.model_rebuild()
GetSongsByGenreOutput.model_rebuild()
GetSongsByGenreParams.model_rebuild()
GetSongsOutput.model_rebuild()
GetSongsParams.model_rebuild()
GetStarredOutput.model_rebuild()
GetStarredParams.model_rebuild()
GetStatsParams.model_rebuild()
GetStoriesParams.model_rebuild()
GetStreamUrlOutput.model_rebuild()
GetStreamUrlParams.model_rebuild()
GetTemporaryLinkParams.model_rebuild()
GetTopArtistsOutput.model_rebuild()
GetTopArtistsParams.model_rebuild()
GetTopScrobblersOutput.model_rebuild()
GetTopScrobblersParams.model_rebuild()
GetTopSongsOutput.model_rebuild()
GetTopSongsParams.model_rebuild()
GetTopTracksOutput.model_rebuild()
GetTopTracksParams.model_rebuild()
GetTrackShoutsOutput.model_rebuild()
GetTrackShoutsParams.model_rebuild()
GetUnreadCountOutput.model_rebuild()
GetUserOutput.model_rebuild()
GetUserParams.model_rebuild()
GetWrappedParams.model_rebuild()
GoogledriveDownloadFileParams.model_rebuild()
GoogledriveFileListView.model_rebuild()
GoogledriveFileView.model_rebuild()
GoogledriveGetFilesParams.model_rebuild()
GoogledriveResponseDirectoriesItemView.model_rebuild()
GoogledriveResponseDirectoryView.model_rebuild()
GoogledriveResponseParentDirectoryView.model_rebuild()
GraphNotFoundActor.model_rebuild()
GraphRelationship.model_rebuild()
InsertDirectoryParams.model_rebuild()
InsertFilesParams.model_rebuild()
LibraryCreatePlaylistInput.model_rebuild()
LibraryCreatePlaylistOutput.model_rebuild()
LibraryGetAlbumOutput.model_rebuild()
LibraryGetAlbumParams.model_rebuild()
LibraryGetArtistOutput.model_rebuild()
LibraryGetArtistParams.model_rebuild()
LibraryGetArtistsOutput.model_rebuild()
LibraryGetArtistsParams.model_rebuild()
LibraryGetPlaylistOutput.model_rebuild()
LibraryGetPlaylistParams.model_rebuild()
LibraryGetPlaylistsOutput.model_rebuild()
LibraryGetPlaylistsParams.model_rebuild()
LibraryGetSongOutput.model_rebuild()
LibraryGetSongParams.model_rebuild()
LibrarySearchOutput.model_rebuild()
LibrarySearchParams.model_rebuild()
LibraryUpdatePlaylistInput.model_rebuild()
LibraryUpdatePlaylistOutput.model_rebuild()
LikeRecord.model_rebuild()
LikeShoutInput.model_rebuild()
LikeSongInput.model_rebuild()
ListNotificationsOutput.model_rebuild()
ListNotificationsParams.model_rebuild()
ListPresetsOutput.model_rebuild()
ListPresetsParams.model_rebuild()
MatchSongParams.model_rebuild()
MirrorSourceView.model_rebuild()
NotificationActor.model_rebuild()
NotificationSubjectView.model_rebuild()
NotificationView.model_rebuild()
PingOutput.model_rebuild()
PingParams.model_rebuild()
PlayDirectoryParams.model_rebuild()
PlayerCurrentlyPlayingViewDetailed.model_rebuild()
PlayerGetCurrentlyPlayingParams.model_rebuild()
PlayerNextParams.model_rebuild()
PlayerPauseParams.model_rebuild()
PlayerPlaybackQueueViewDetailed.model_rebuild()
PlayerPlayParams.model_rebuild()
PlayerPreviousParams.model_rebuild()
PlayerSeekParams.model_rebuild()
PlayFileParams.model_rebuild()
PlaylistCreatePlaylistOutput.model_rebuild()
PlaylistCreatePlaylistParams.model_rebuild()
PlaylistGetPlaylistParams.model_rebuild()
PlaylistGetPlaylistsOutput.model_rebuild()
PlaylistGetPlaylistsParams.model_rebuild()
PlaylistRecord.model_rebuild()
PlaylistSongRecord.model_rebuild()
PlaylistUpdatePlaylistOutput.model_rebuild()
PlaylistUpdatePlaylistParams.model_rebuild()
PlaylistViewBasic.model_rebuild()
PlaylistViewDetailed.model_rebuild()
ProfileRecord.model_rebuild()
PutAudioSettingsInput.model_rebuild()
PutMirrorSourceInput.model_rebuild()
PutPresetInput.model_rebuild()
RadioRecord.model_rebuild()
RadioViewBasic.model_rebuild()
RadioViewDetailed.model_rebuild()
RemoveApikeyParams.model_rebuild()
RemovePlaylistParams.model_rebuild()
RemoveShoutParams.model_rebuild()
RemoveTrackParams.model_rebuild()
ReplyShoutInput.model_rebuild()
ReportShoutInput.model_rebuild()
RockboxCrossfadeSettings.model_rebuild()
RockboxEqualizerBand.model_rebuild()
RockboxEqualizerSettings.model_rebuild()
RockboxReplayGainSettings.model_rebuild()
RockboxSettingsView.model_rebuild()
RockboxToneSettings.model_rebuild()
SavePlayQueueInput.model_rebuild()
SavePlayQueueOutput.model_rebuild()
ScrobbleFirstScrobbleView.model_rebuild()
ScrobbleInput.model_rebuild()
ScrobbleOutput.model_rebuild()
ScrobbleRecord.model_rebuild()
ScrobbleViewBasic.model_rebuild()
ScrobbleViewDetailed.model_rebuild()
SettingsRecord.model_rebuild()
ShoutAuthor.model_rebuild()
ShoutGif.model_rebuild()
ShoutMention.model_rebuild()
ShoutRecord.model_rebuild()
ShoutView.model_rebuild()
SongFirstScrobbleView.model_rebuild()
SongGetSongParams.model_rebuild()
SongMatchView.model_rebuild()
SongRecentListenerView.model_rebuild()
SongRecord.model_rebuild()
SongResponseMbArtistsItemView.model_rebuild()
SongViewBasic.model_rebuild()
SongViewDetailed.model_rebuild()
SpotifyGetCurrentlyPlayingParams.model_rebuild()
SpotifySeekParams.model_rebuild()
SpotifyTrackView.model_rebuild()
StarInput.model_rebuild()
StarOutput.model_rebuild()
StartPlaylistParams.model_rebuild()
StartScanOutput.model_rebuild()
StartScanParams.model_rebuild()
StatsGlobalStatsView.model_rebuild()
StatsView.model_rebuild()
StatsWrappedAlbum.model_rebuild()
StatsWrappedArtist.model_rebuild()
StatsWrappedDayCount.model_rebuild()
StatsWrappedGenreCount.model_rebuild()
StatsWrappedMilestone.model_rebuild()
StatsWrappedMonthCount.model_rebuild()
StatsWrappedTrack.model_rebuild()
StatsWrappedView.model_rebuild()
StatusRecord.model_rebuild()
StrongRef.model_rebuild()
UnfollowAccountOutput.model_rebuild()
UnfollowAccountParams.model_rebuild()
UnstarInput.model_rebuild()
UnstarOutput.model_rebuild()
UpdateApikeyInput.model_rebuild()
UpdateNowPlayingInput.model_rebuild()
UpdateNowPlayingOutput.model_rebuild()
UpdateSeenInput.model_rebuild()
UpdateSeenOutput.model_rebuild()
