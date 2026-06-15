module Rocksky
  # Top-level client for the Rocksky XRPC API.
  #
  #   client = Rocksky.new(token: ENV["ROCKSKY_TOKEN"])
  #   client.actor.get_profile(did: "alice.bsky.social")
  #
  # Resources are lazily instantiated and memoised: `client.actor`, `client.album`,
  # `client.artist`, `client.scrobble`, etc.
  class Client
    DEFAULT_BASE_URL = "https://api.rocksky.app".freeze

    attr_reader :base_url, :token, :headers, :user_agent,
                :open_timeout, :read_timeout

    def initialize(
      base_url: nil,
      token: nil,
      headers: {},
      user_agent: "rocksky-ruby/#{Rocksky::VERSION}",
      open_timeout: HTTP::DEFAULT_OPEN_TIMEOUT,
      read_timeout: HTTP::DEFAULT_READ_TIMEOUT
    )
      @base_url = normalize_base_url(base_url || ENV["ROCKSKY_BASE_URL"] || DEFAULT_BASE_URL)
      @token = token || ENV["ROCKSKY_TOKEN"]
      @headers = headers.dup
      @user_agent = user_agent
      @open_timeout = open_timeout
      @read_timeout = read_timeout
      @http = HTTP.new(self)
    end

    # Return a derived client that uses the given token (everything else copied).
    # Handy for sharing one client across users in a request-scoped server.
    def with_token(new_token)
      self.class.new(
        base_url: base_url,
        token: new_token,
        headers: headers,
        user_agent: user_agent,
        open_timeout: open_timeout,
        read_timeout: read_timeout
      )
    end

    # ---- Raw XRPC access ---------------------------------------------------

    def query(nsid, **params)
      @http.query(nsid, params)
    end

    def procedure(nsid, params: {}, body: nil)
      @http.procedure(nsid, params, body)
    end

    # ---- Resource accessors ------------------------------------------------

    def actor;    @actor    ||= Resources::Actor.new(@http); end
    def album;    @album    ||= Resources::Album.new(@http); end
    def apikey;   @apikey   ||= Resources::Apikey.new(@http); end
    def artist;   @artist   ||= Resources::Artist.new(@http); end
    def charts;   @charts   ||= Resources::Charts.new(@http); end
    def feed;     @feed     ||= Resources::Feed.new(@http); end
    def graph;    @graph    ||= Resources::Graph.new(@http); end
    def like;     @like     ||= Resources::Like.new(@http); end
    def mirror;   @mirror   ||= Resources::Mirror.new(@http); end
    def rockbox;  @rockbox  ||= Resources::Rockbox.new(@http); end
    def player;   @player   ||= Resources::Player.new(@http); end
    def playlist; @playlist ||= Resources::Playlist.new(@http); end
    def scrobble; @scrobble ||= Resources::Scrobble.new(@http); end
    def shout;    @shout    ||= Resources::Shout.new(@http); end
    def song;     @song     ||= Resources::Song.new(@http); end
    def spotify;  @spotify  ||= Resources::Spotify.new(@http); end
    def stats;    @stats    ||= Resources::Stats.new(@http); end

    def inspect
      "#<Rocksky::Client base_url=#{base_url.inspect} token=#{token ? "[FILTERED]" : nil.inspect}>"
    end

    private

    def normalize_base_url(url)
      url.to_s.sub(%r{/+\z}, "")
    end
  end
end
