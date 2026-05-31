import Config

config :rocksky_ex,
  base_url: "https://api.rocksky.app"

if Mix.env() == :test do
  config :rocksky_ex, http_adapter: {Req, plug: {Req.Test, Rocksky.HTTP}}
end
