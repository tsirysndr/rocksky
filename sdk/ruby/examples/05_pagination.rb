# 05_pagination.rb — walk an entire result set with offset-based pagination.
#
#   bundle exec ruby examples/05_pagination.rb alice.bsky.social

require "rocksky"

handle = ARGV[0] || "alice.bsky.social"
client = Rocksky.new

page_size = 50
offset = 0
total = 0

loop do
  result = client.actor.get_actor_scrobbles(
    did: handle,
    limit: page_size,
    offset: offset
  )
  rows = Array(result["scrobbles"])
  break if rows.empty?

  total += rows.size
  offset += page_size
  puts "fetched #{rows.size} (running total: #{total})"

  break if rows.size < page_size
end

puts "done — #{total} scrobbles total"
