# 03_charts.rb — print the top 10 artists and tracks for the last 30 days.
#
#   bundle exec ruby examples/03_charts.rb

require "rocksky"
require "date"

client = Rocksky.new
window_start = (Date.today - 30).to_s

top_artists = client.charts.get_top_artists(limit: 10, start_date: window_start)
puts "Top artists since #{window_start}:"
Array(top_artists["artists"]).each_with_index do |a, i|
  puts "  #{i + 1}. #{a["name"]} (#{a["scrobbles"] || a["playcount"]} plays)"
end
puts

top_tracks = client.charts.get_top_tracks(limit: 10, start_date: window_start)
puts "Top tracks since #{window_start}:"
Array(top_tracks["tracks"]).each_with_index do |t, i|
  puts "  #{i + 1}. #{t["title"]} — #{t["artist"]} (#{t["scrobbles"] || t["playcount"]})"
end
