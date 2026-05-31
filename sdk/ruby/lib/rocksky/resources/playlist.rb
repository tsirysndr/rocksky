module Rocksky
  module Resources
    # `app.rocksky.playlist.*` endpoints.
    class Playlist < Base
      # Fetch a playlist.
      def get_playlist(uri:)
        query("app.rocksky.playlist.getPlaylist", uri: uri)
      end

      # List playlists.
      def get_playlists(limit: nil, offset: nil)
        query("app.rocksky.playlist.getPlaylists", limit: limit, offset: offset)
      end

      # Create a playlist.
      def create_playlist(name:, description: nil)
        procedure("app.rocksky.playlist.createPlaylist",
                  params: { name: name, description: description })
      end

      # Remove a playlist.
      def remove_playlist(uri:)
        procedure("app.rocksky.playlist.removePlaylist", params: { uri: uri })
      end

      # Start a playlist.
      def start_playlist(uri:, shuffle: nil, position: nil)
        procedure("app.rocksky.playlist.startPlaylist",
                  params: { uri: uri, shuffle: shuffle, position: position })
      end

      # Insert files into a playlist.
      def insert_files(uri:, files:, position: nil)
        procedure("app.rocksky.playlist.insertFiles",
                  params: { uri: uri, files: files, position: position })
      end

      # Insert a directory into a playlist.
      def insert_directory(uri:, directory:, position: nil)
        procedure("app.rocksky.playlist.insertDirectory",
                  params: { uri: uri, directory: directory, position: position })
      end
    end
  end
end
