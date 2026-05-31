# 04_search.rb — search the catalogue.
#
#   bundle exec ruby examples/04_search.rb "nirvana"

require "rocksky"

term = ARGV[0] || "nirvana"
client = Rocksky.new

hits = client.feed.search(term)
%w[artists albums tracks].each do |bucket|
  rows = Array(hits[bucket])
  next if rows.empty?

  puts "#{bucket.capitalize}:"
  rows.first(5).each do |r|
    puts "  - #{r["name"] || r["title"]}"
  end
  puts
end
