# 00_setup.rb — environment + client construction.
#
# Run from sdk/ruby:
#
#   bundle exec ruby examples/00_setup.rb
#
# This file is intentionally tiny — it just verifies the SDK loads and that
# your env is wired up. Use it as a template for your own scripts.

require "rocksky"

# `Rocksky.new` reads ROCKSKY_BASE_URL and ROCKSKY_TOKEN from the environment
# if you don't pass them explicitly. The defaults connect to the production
# host with no token (read-only).
client = Rocksky.new

puts "Connected to: #{client.base_url}"
puts "Auth token : #{client.token ? "present" : "none (read-only)"}"
puts "Resources : #{%i[actor album apikey artist charts feed graph like mirror
                       player playlist scrobble shout song spotify stats]
                       .inspect}"
