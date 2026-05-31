require "json"
require "net/http"
require "uri"

module Rocksky
  # Low-level XRPC transport. Most users should go through the resource
  # accessors on {Rocksky::Client} (e.g. `client.actor.get_profile(...)`).
  class HTTP
    DEFAULT_OPEN_TIMEOUT = 10
    DEFAULT_READ_TIMEOUT = 30

    attr_reader :client

    def initialize(client)
      @client = client
    end

    # GET /xrpc/<nsid>?...
    def query(nsid, params = {})
      request(method: :get, nsid: nsid, params: params)
    end

    # POST /xrpc/<nsid>?... with optional JSON body.
    def procedure(nsid, params = {}, body = nil)
      request(method: :post, nsid: nsid, params: params, body: body)
    end

    private

    def request(method:, nsid:, params: {}, body: nil)
      uri = build_uri(nsid, params)
      req = build_request(method, uri, body)
      apply_headers(req)

      response = perform(uri, req)
      handle_response(response, nsid)
    rescue Timeout::Error, Errno::ECONNREFUSED, SocketError, IOError,
           Net::OpenTimeout, Net::ReadTimeout => e
      raise Error.from_transport(e, nsid: nsid)
    end

    def build_uri(nsid, params)
      url = "#{client.base_url}/xrpc/#{nsid}"
      uri = URI.parse(url)
      encoded = encode_params(params)
      uri.query = URI.encode_www_form(encoded) unless encoded.empty?
      uri
    end

    def build_request(method, uri, body)
      req =
        case method
        when :get  then Net::HTTP::Get.new(uri.request_uri)
        when :post then Net::HTTP::Post.new(uri.request_uri)
        else raise ArgumentError, "unsupported method: #{method}"
        end

      if body && !body.empty?
        req["content-type"] = "application/json"
        req.body = JSON.generate(body)
      end

      req
    end

    def apply_headers(req)
      req["accept"] = "application/json"
      req["user-agent"] = client.user_agent if client.user_agent
      req["authorization"] = "Bearer #{client.token}" if client.token
      client.headers.each { |name, value| req[name] = value }
    end

    def perform(uri, req)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == "https")
      http.open_timeout = client.open_timeout
      http.read_timeout = client.read_timeout
      http.request(req)
    end

    def handle_response(response, nsid)
      status = response.code.to_i
      body = parse_body(response)

      return body if status.between?(200, 299)

      raise Error.from_response(status, body, nsid: nsid)
    end

    def parse_body(response)
      return nil if response.body.nil? || response.body.empty?

      content_type = response["content-type"].to_s
      if content_type.include?("application/json")
        JSON.parse(response.body)
      else
        response.body
      end
    rescue JSON::ParserError
      response.body
    end

    # Drop nil values; convert symbol keys to strings; join arrays with commas
    # (matches the lexicon-defined array encoding used by other SDKs).
    def encode_params(params)
      return {} if params.nil?

      Hash(params).each_with_object({}) do |(key, value), out|
        next if value.nil?

        out[key.to_s] = encode_value(value)
      end
    end

    def encode_value(value)
      case value
      when Array then value.join(",")
      when true, false then value.to_s
      else value
      end
    end
  end
end
