# frozen_string_literal: true

module Rocksky
  # Authenticated client for the app.rocksky.library.* API — the Subsonic /
  # navidrome-compatible surface over a user's uploaded music. Every method
  # requires auth, so a token is mandatory at construction (see Rocksky.library).
  # Optional params are Ruby keyword args (nil = omitted); wire keys stay
  # camelCase. Returns the parsed JSON payload.
  class Library
    def initialize(token, base: nil)
      raise Error, "app.rocksky.library.* requires an access token" if token.nil? || token.to_s.empty?

      @token = token.to_s
      @base = base.to_s
    end

    # app.rocksky.library.ping
    def ping()
      query("app.rocksky.library.ping", {})
    end

    # app.rocksky.library.getLicense
    def get_license()
      query("app.rocksky.library.getLicense", {})
    end

    # app.rocksky.library.getMusicFolders
    def get_music_folders()
      query("app.rocksky.library.getMusicFolders", {})
    end

    # app.rocksky.library.getScanStatus
    def get_scan_status()
      query("app.rocksky.library.getScanStatus", {})
    end

    # app.rocksky.library.startScan
    def start_scan()
      query("app.rocksky.library.startScan", {})
    end

    # app.rocksky.library.getUser
    def get_user()
      query("app.rocksky.library.getUser", {})
    end

    # app.rocksky.library.getArtists
    def get_artists()
      query("app.rocksky.library.getArtists", {})
    end

    # app.rocksky.library.getIndexes
    def get_indexes()
      query("app.rocksky.library.getIndexes", {})
    end

    # app.rocksky.library.getArtist
    def get_artist(id)
      query("app.rocksky.library.getArtist", { id: id })
    end

    # app.rocksky.library.getArtistInfo
    def get_artist_info(id)
      query("app.rocksky.library.getArtistInfo", { id: id })
    end

    # app.rocksky.library.getAlbum
    def get_album(id)
      query("app.rocksky.library.getAlbum", { id: id })
    end

    # app.rocksky.library.getAlbumList
    def get_album_list(type, size: nil, offset: nil, from_year: nil, to_year: nil, genre: nil)
      query("app.rocksky.library.getAlbumList", { type: type, size: size, offset: offset, fromYear: from_year, toYear: to_year, genre: genre })
    end

    # app.rocksky.library.getAlbumInfo
    def get_album_info(id)
      query("app.rocksky.library.getAlbumInfo", { id: id })
    end

    # app.rocksky.library.getSong
    def get_song(id)
      query("app.rocksky.library.getSong", { id: id })
    end

    # app.rocksky.library.getRandomSongs
    def get_random_songs(size: nil, genre: nil, from_year: nil, to_year: nil)
      query("app.rocksky.library.getRandomSongs", { size: size, genre: genre, fromYear: from_year, toYear: to_year })
    end

    # app.rocksky.library.getSongsByGenre
    def get_songs_by_genre(genre, count: nil, offset: nil)
      query("app.rocksky.library.getSongsByGenre", { genre: genre, count: count, offset: offset })
    end

    # app.rocksky.library.getSimilarSongs
    def get_similar_songs(id, count: nil)
      query("app.rocksky.library.getSimilarSongs", { id: id, count: count })
    end

    # app.rocksky.library.getTopSongs
    def get_top_songs(artist, count: nil)
      query("app.rocksky.library.getTopSongs", { artist: artist, count: count })
    end

    # app.rocksky.library.getLyrics
    def get_lyrics(artist: nil, title: nil)
      query("app.rocksky.library.getLyrics", { artist: artist, title: title })
    end

    # app.rocksky.library.getMusicDirectory
    def get_music_directory(id)
      query("app.rocksky.library.getMusicDirectory", { id: id })
    end

    # app.rocksky.library.getGenres
    def get_genres()
      query("app.rocksky.library.getGenres", {})
    end

    # app.rocksky.library.search
    def search(query, artist_count: nil, artist_offset: nil, album_count: nil, album_offset: nil, song_count: nil, song_offset: nil)
      query("app.rocksky.library.search", { query: query, artistCount: artist_count, artistOffset: artist_offset, albumCount: album_count, albumOffset: album_offset, songCount: song_count, songOffset: song_offset })
    end

    # app.rocksky.library.getStarred
    def get_starred()
      query("app.rocksky.library.getStarred", {})
    end

    # app.rocksky.library.star
    def star(id, album_id: nil, artist_id: nil)
      procedure("app.rocksky.library.star", { id: id, albumId: album_id, artistId: artist_id })
    end

    # app.rocksky.library.unstar
    def unstar(id, album_id: nil, artist_id: nil)
      procedure("app.rocksky.library.unstar", { id: id, albumId: album_id, artistId: artist_id })
    end

    # app.rocksky.library.getPlaylists
    def get_playlists()
      query("app.rocksky.library.getPlaylists", {})
    end

    # app.rocksky.library.getPlaylist
    def get_playlist(id)
      query("app.rocksky.library.getPlaylist", { id: id })
    end

    # app.rocksky.library.createPlaylist
    def create_playlist(name)
      procedure("app.rocksky.library.createPlaylist", { name: name })
    end

    # app.rocksky.library.updatePlaylist
    def update_playlist(playlist_id, name: nil, comment: nil, song_id_to_add: nil, song_index_to_remove: nil)
      procedure("app.rocksky.library.updatePlaylist", { playlistId: playlist_id, name: name, comment: comment, songIdToAdd: song_id_to_add, songIndexToRemove: song_index_to_remove })
    end

    # app.rocksky.library.deletePlaylist
    def delete_playlist(id)
      procedure("app.rocksky.library.deletePlaylist", { id: id })
    end

    # app.rocksky.library.deleteSong
    def delete_song(id)
      procedure("app.rocksky.library.deleteSong", { id: id })
    end

    # app.rocksky.library.deleteAlbum
    def delete_album(id)
      procedure("app.rocksky.library.deleteAlbum", { id: id })
    end

    # app.rocksky.library.scrobble
    def scrobble(id, time: nil, submission: nil)
      procedure("app.rocksky.library.scrobble", { id: id, time: time, submission: submission })
    end

    # app.rocksky.library.updateNowPlaying
    def update_now_playing(id)
      procedure("app.rocksky.library.updateNowPlaying", { id: id })
    end

    # app.rocksky.library.getNowPlaying
    def get_now_playing()
      query("app.rocksky.library.getNowPlaying", {})
    end

    # app.rocksky.library.getPlayQueue
    def get_play_queue()
      query("app.rocksky.library.getPlayQueue", {})
    end

    # app.rocksky.library.savePlayQueue
    def save_play_queue(id: nil, current: nil, position: nil)
      procedure("app.rocksky.library.savePlayQueue", { id: id, current: current, position: position })
    end

    # app.rocksky.library.getStreamUrl
    def get_stream_url(id, max_bit_rate: nil, format: nil)
      query("app.rocksky.library.getStreamUrl", { id: id, maxBitRate: max_bit_rate, format: format })
    end

    # app.rocksky.library.getDownloadUrl
    def get_download_url(id)
      query("app.rocksky.library.getDownloadUrl", { id: id })
    end

    # app.rocksky.library.getCoverArtUrl
    def get_cover_art_url(id, size: nil)
      query("app.rocksky.library.getCoverArtUrl", { id: id, size: size })
    end

    # app.rocksky.library.getInternetRadioStations
    def get_internet_radio_stations()
      query("app.rocksky.library.getInternetRadioStations", {})
    end

    private

    def query(nsid, params = {})
      Rocksky.unwrap(C.rocksky_library_get(@base, @token, nsid, JSON.generate(params.compact)))
    end

    def procedure(nsid, body = {})
      Rocksky.unwrap(C.rocksky_library_post(@base, @token, nsid, JSON.generate(body.compact)))
    end
  end
end
