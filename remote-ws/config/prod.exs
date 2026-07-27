import Config

# Compile-time production config. Runtime values (endpoint port, secret_key_base,
# DB/Redis/NATS URLs) are read from the environment in config/runtime.exs.
config :logger, level: :info
