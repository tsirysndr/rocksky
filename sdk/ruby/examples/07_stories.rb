# 07_stories.rb — latest scrobble per user, optionally filtered.
#
#   bundle exec ruby examples/07_stories.rb
#   bundle exec ruby examples/07_stories.rb metalcore
#   ROCKSKY_TOKEN=<jwt> bundle exec ruby examples/07_stories.rb following

require "rocksky"

FEEDS = {
  "metalcore" => "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore",
  "trap"      => "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/trap",
  "synthwave" => "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/synthwave"
}.freeze

mode = ARGV[0]
client = Rocksky.new(token: ENV["ROCKSKY_TOKEN"])

kwargs = { size: 10 }
if FEEDS.key?(mode)
  kwargs[:feed] = FEEDS[mode]
elsif mode == "following"
  kwargs[:following] = true
end

result = client.feed.get_stories(**kwargs)
Array(result["stories"]).each do |s|
  printf("@%-24s %s — %s\n", s["handle"], s["artist"], s["title"])
end
puts "\n#{Array(result["stories"]).size} stories"
