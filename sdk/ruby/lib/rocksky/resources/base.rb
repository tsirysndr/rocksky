module Rocksky
  module Resources
    # Shared plumbing for resource classes. Each subclass calls {#query} or
    # {#procedure} with the lexicon NSID; the {Rocksky::HTTP} instance does the
    # actual transport work.
    class Base
      attr_reader :http

      def initialize(http)
        @http = http
      end

      protected

      def query(nsid, **params)
        @http.query(nsid, params)
      end

      def procedure(nsid, params: {}, body: nil)
        @http.procedure(nsid, params, body)
      end
    end
  end
end
