# frozen_string_literal: true

module Rocksky
  # app.rocksky.playlist.* — the global, AT-Proto-backed playlists.
  #
  # Distinct from Rocksky::Library's playlist methods, which drive the
  # Subsonic/Navidrome library (app.rocksky.library.*).
  #
  # Writes publish records to the caller's repo, so they need a +token+ and only
  # show up in reads once the AppView has ingested the commit.
  module Playlist
    module_function

    # The playlist catalog.
    def list(limit: 50, offset: 0, filter: nil, base: nil)
      params = { limit: limit, offset: offset }
      params[:filter] = filter if filter
      Rocksky.get("app.rocksky.playlist.getPlaylists", params, base: base)
    end

    # A single playlist with its tracks. +filter+ is an RSQL expression over the
    # tracks (e.g. 'artist=="Daft Punk"').
    def get(uri, filter: nil, base: nil)
      params = { uri: uri }
      params[:filter] = filter if filter
      Rocksky.get("app.rocksky.playlist.getPlaylist", params, base: base)
    end

    # Create a playlist. Returns { "uri" => ..., "cid" => ... }.
    def create(name, token:, description: nil, picture_url: nil, base: nil)
      params = { name: name }
      params[:description] = description if description
      params[:pictureUrl] = picture_url if picture_url
      Rocksky.post("app.rocksky.playlist.createPlaylist", params, base: base, token: token)
    end

    # Rename or re-describe a playlist. Owner only.
    def update(uri, token:, name: nil, description: nil, picture_url: nil, base: nil)
      params = { uri: uri }
      params[:name] = name if name
      params[:description] = description if description
      params[:pictureUrl] = picture_url if picture_url
      Rocksky.post("app.rocksky.playlist.updatePlaylist", params, base: base, token: token)
    end

    # Add songs by their app.rocksky.song AT-URIs. Owner only. Returns
    # { "uris" => [...] } — the created entry records.
    def add_songs(uri, songs, token:, base: nil)
      Rocksky.post("app.rocksky.playlist.addSongs", { uri: uri, songs: songs },
                   base: base, token: token)
    end

    # Remove a song. An entry lives in the repo that added it, so only that repo
    # can retract it.
    def remove_track(uri, song_uri, token:, base: nil)
      Rocksky.post("app.rocksky.playlist.removeTrack", { uri: uri, songUri: song_uri },
                   base: base, token: token)
    end

    # Delete a playlist and the caller's own entries. Owner only.
    def remove(uri, token:, base: nil)
      Rocksky.post("app.rocksky.playlist.removePlaylist", { uri: uri }, base: base, token: token)
    end
  end
end
