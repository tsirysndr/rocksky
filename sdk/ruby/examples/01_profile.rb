# 01_profile.rb — fetch a profile and the actor's recent scrobbles.
#
#   bundle exec ruby examples/01_profile.rb alice.bsky.social
#
# Anonymous access works for these endpoints (no token needed).

require "rocksky"

handle = ARGV[0] || "alice.bsky.social"
client = Rocksky.new

profile = client.actor.get_profile(did: handle)
puts "#{profile["displayName"] || profile["handle"]} (#{profile["did"]})"
puts "  scrobbles: #{profile["scrobblesCount"]}"
puts "  followers: #{profile["followersCount"]}"
puts

scrobbles = client.actor.get_actor_scrobbles(did: handle, limit: 5)
puts "Recent scrobbles:"
Array(scrobbles["scrobbles"]).each_with_index do |s, i|
  track = s["track"] || s
  puts "  #{i + 1}. #{track["title"]} — #{track["artist"]}"
end
