$LOAD_PATH.unshift File.expand_path("../lib", __dir__)

require "minitest/autorun"
require "webmock/minitest"
require "json"
require "rocksky"

module RockskyTest
  BASE_URL = "https://api.test.rocksky.app".freeze

  module Helpers
    def build_client(token: nil, **opts)
      Rocksky.new(base_url: RockskyTest::BASE_URL, token: token, **opts)
    end

    # Stub a successful JSON response on a given xrpc endpoint.
    def stub_xrpc(method, nsid, status: 200, body: {}, with: nil)
      url = "#{RockskyTest::BASE_URL}/xrpc/#{nsid}"
      stub = stub_request(method, %r{^#{Regexp.escape(url)}})
      stub = stub.with(with) if with
      stub.to_return(
        status: status,
        headers: { "content-type" => "application/json" },
        body: body.is_a?(String) ? body : JSON.generate(body)
      )
    end
  end
end

class Minitest::Test
  include RockskyTest::Helpers
end
