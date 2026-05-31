module Rocksky
  module Resources
    # `app.rocksky.player.*` endpoints — remote control of a Rocksky player.
    class Player < Base
      # Currently playing track.
      def get_currently_playing(player_id: nil, actor: nil)
        query("app.rocksky.player.getCurrentlyPlaying",
              playerId: player_id, actor: actor)
      end

      # Playback queue.
      def get_playback_queue(player_id: nil)
        query("app.rocksky.player.getPlaybackQueue", playerId: player_id)
      end

      # Resume playback.
      def play(player_id: nil)
        procedure("app.rocksky.player.play", params: { playerId: player_id })
      end

      # Pause playback.
      def pause(player_id: nil)
        procedure("app.rocksky.player.pause", params: { playerId: player_id })
      end

      # Skip to next track.
      def next(player_id: nil)
        procedure("app.rocksky.player.next", params: { playerId: player_id })
      end

      # Go to previous track.
      def previous(player_id: nil)
        procedure("app.rocksky.player.previous", params: { playerId: player_id })
      end

      # Seek to position in milliseconds.
      def seek(position:, player_id: nil)
        procedure("app.rocksky.player.seek",
                  params: { playerId: player_id, position: position })
      end

      # Play a single file.
      def play_file(file_id:, player_id: nil)
        procedure("app.rocksky.player.playFile",
                  params: { playerId: player_id, fileId: file_id })
      end

      # Play a directory.
      def play_directory(directory_id:, player_id: nil, shuffle: nil,
                         recurse: nil, position: nil)
        procedure("app.rocksky.player.playDirectory",
                  params: {
                    playerId: player_id,
                    directoryId: directory_id,
                    shuffle: shuffle,
                    recurse: recurse,
                    position: position
                  })
      end

      # Append items to the queue. `items` is an Array of file identifiers.
      def add_items_to_queue(items:, player_id: nil, position: nil, shuffle: nil)
        procedure("app.rocksky.player.addItemsToQueue",
                  params: {
                    playerId: player_id,
                    items: items,
                    position: position,
                    shuffle: shuffle
                  })
      end
    end
  end
end
