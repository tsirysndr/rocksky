# 06_error_handling.rb — what the SDK raises and how to handle it.
#
#   bundle exec ruby examples/06_error_handling.rb

require "rocksky"

client = Rocksky.new

# `Rocksky::Error` is the base class. The SDK raises a per-status subclass:
#
#   Rocksky::BadRequest    — 400
#   Rocksky::Unauthorized  — 401
#   Rocksky::Forbidden     — 403
#   Rocksky::NotFound      — 404
#   Rocksky::RateLimited   — 429
#   Rocksky::ServerError   — 5xx
#   Rocksky::HTTPError     — any other non-2xx status
#   Rocksky::TransportError — DNS/TCP/timeout errors before any HTTP response
#
# Each error carries:
#   .status — HTTP status (nil for transport errors)
#   .body   — parsed JSON Hash, or raw String
#   .nsid   — the XRPC NSID we were calling
#
begin
  client.song.get_song(uri: "at://does-not-exist")
rescue Rocksky::NotFound => e
  puts "song missing — #{e.message} (status=#{e.status}, nsid=#{e.nsid})"
rescue Rocksky::Unauthorized
  puts "need a token for this endpoint"
rescue Rocksky::RateLimited
  puts "back off and retry later"
rescue Rocksky::Error => e
  puts "unexpected rocksky failure: #{e.class}: #{e.message}"
end
