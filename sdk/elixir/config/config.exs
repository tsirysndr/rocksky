import Config

config :rocksky,
  base_url: "https://api.rocksky.app"

if Mix.env() == :test do
  config :rocksky, http_adapter: {Req, plug: {Req.Test, Rocksky.HTTP}}
end
