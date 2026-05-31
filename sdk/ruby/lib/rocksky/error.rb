module Rocksky
  class Error < StandardError
    attr_reader :status, :body, :nsid

    def initialize(message, status: nil, body: nil, nsid: nil)
      super(message)
      @status = status
      @body = body
      @nsid = nsid
    end

    def self.from_response(status, body, nsid: nil)
      message = extract_message(body) || "request failed"
      klass = klass_for(status)
      klass.new(message, status: status, body: body, nsid: nsid)
    end

    def self.from_transport(cause, nsid: nil)
      TransportError.new(
        "transport error: #{cause.class}: #{cause.message}",
        body: nil,
        nsid: nsid
      )
    end

    def self.klass_for(status)
      case status
      when 400 then BadRequest
      when 401 then Unauthorized
      when 403 then Forbidden
      when 404 then NotFound
      when 429 then RateLimited
      when 500..599 then ServerError
      else HTTPError
      end
    end
    private_class_method :klass_for

    def self.extract_message(body)
      case body
      when Hash
        body["message"] || body["error"] || body[:message] || body[:error]
      when String
        body unless body.empty?
      end
    end
    private_class_method :extract_message
  end

  class HTTPError < Error; end
  class BadRequest < HTTPError; end
  class Unauthorized < HTTPError; end
  class Forbidden < HTTPError; end
  class NotFound < HTTPError; end
  class RateLimited < HTTPError; end
  class ServerError < HTTPError; end
  class TransportError < Error; end
end
