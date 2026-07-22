require_relative "lib/rocksky/version"

Gem::Specification.new do |spec|
  spec.name        = "rocksky"
  spec.version     = Rocksky::VERSION
  spec.authors     = ["Rocksky"]
  spec.email       = ["hi@rocksky.app"]

  spec.summary     = "Ruby SDK for Rocksky — native bindings to the shared Rust core."
  spec.description = "Ruby SDK for Rocksky (rocksky.app): native bindings to the " \
                     "shared Rust core — AppView reads, AT Protocol PDS writes " \
                     "(scrobble, like, follow, shout), and identity hashes."
  spec.homepage    = "https://github.com/tsirysndr/rocksky"
  spec.license     = "MIT"

  spec.required_ruby_version = ">= 3.0.0"

  spec.metadata = {
    "homepage_uri"      => spec.homepage,
    "source_code_uri"   => "https://github.com/tsirysndr/rocksky/tree/main/sdk/ruby",
    "bug_tracker_uri"   => "https://github.com/tsirysndr/rocksky/issues",
    "documentation_uri" => "https://docs.rocksky.app",
    "rubygems_mfa_required" => "true"
  }

  spec.files = Dir[
    "lib/**/*.rb",
    # native-core download manifest (the lib itself is fetched on first load,
    # never bundled — only *.rb + this json ship).
    "lib/rocksky/manifest.json",
    "exe/*",
    "*.gemspec",
    "LICENSE",
    "README.md",
    "CHANGELOG.md"
  ]
  spec.require_paths = ["lib"]
  spec.bindir        = "exe"
  spec.executables   = Dir["exe/*"].map { |f| File.basename(f) }

  spec.add_development_dependency "irb", "~> 1.11"
  spec.add_development_dependency "minitest", "~> 5.20"
  spec.add_development_dependency "rake", "~> 13.0"
  spec.add_development_dependency "webmock", "~> 3.19"
end
