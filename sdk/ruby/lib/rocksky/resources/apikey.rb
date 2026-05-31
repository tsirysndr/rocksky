module Rocksky
  module Resources
    # `app.rocksky.apikey.*` endpoints. All require an authenticated client.
    class Apikey < Base
      # List your API keys.
      def get_apikeys(limit: nil, offset: nil)
        query("app.rocksky.apikey.getApikeys", limit: limit, offset: offset)
      end

      # Create a new API key.
      def create_apikey(name:, description: nil)
        body = { name: name, description: description }.compact
        procedure("app.rocksky.apikey.createApikey", body: body)
      end

      # Update an API key.
      def update_apikey(id:, name: nil, description: nil)
        body = { id: id, name: name, description: description }.compact
        procedure("app.rocksky.apikey.updateApikey", body: body)
      end

      # Remove an API key.
      def remove_apikey(id:)
        procedure("app.rocksky.apikey.removeApikey", params: { id: id })
      end
    end
  end
end
