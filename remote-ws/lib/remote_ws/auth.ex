defmodule RemoteWs.Auth do
  @moduledoc """
  Bearer-token verification — a port of apps/api lib/verifyToken.ts.

  Verifies the HS256 signature against `:remote_ws, :jwt_secret` (mirrors
  env.JWT_SECRET) WITHOUT enforcing expiration (matches jwt.verify's
  `ignoreExpiration: true`). If the token carries `type == "access_token"` with a
  `jti`, the jti must still exist in the access_tokens table or the token is
  treated as revoked.
  """

  @access_token_type "access_token"

  @type verified :: %{did: String.t() | nil, jti: String.t() | nil, type: String.t() | nil}

  @spec verify_token(String.t()) :: {:ok, verified} | {:error, term()}
  def verify_token(bearer) when is_binary(bearer) and bearer != "" do
    secret = Application.fetch_env!(:remote_ws, :jwt_secret)
    signer = Joken.Signer.create("HS256", secret)

    case Joken.verify(bearer, signer) do
      {:ok, claims} ->
        if claims["type"] == @access_token_type and is_binary(claims["jti"]) do
          if RemoteWs.Store.access_token_exists?(claims["jti"]) do
            {:ok, extract(claims)}
          else
            {:error, :revoked}
          end
        else
          {:ok, extract(claims)}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  def verify_token(_), do: {:error, :invalid_token}

  defp extract(claims) do
    %{did: claims["did"], jti: claims["jti"], type: claims["type"]}
  end
end
