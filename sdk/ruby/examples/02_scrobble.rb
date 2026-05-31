# 02_scrobble.rb — submit a scrobble. Requires ROCKSKY_TOKEN.
#
#   ROCKSKY_TOKEN=... bundle exec ruby examples/02_scrobble.rb

require "rocksky"

client = Rocksky.new
abort "Set ROCKSKY_TOKEN first" unless client.token

result = client.scrobble.create_scrobble(
  title: "In Bloom",
  artist: "Nirvana",
  album: "Nevermind",
  timestamp: Time.now.to_i
)

puts "Scrobbled: #{result.inspect}"
rescue Rocksky::Unauthorized => e
  abort "Token rejected: #{e.message}"
rescue Rocksky::Error => e
  abort "Rocksky error (#{e.status}): #{e.message}"
