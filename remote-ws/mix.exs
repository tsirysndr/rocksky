defmodule RemoteWs.MixProject do
  use Mix.Project

  def project do
    [
      app: :remote_ws,
      version: "0.1.0",
      elixir: "~> 1.16",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps()
    ]
  end

  # Run "mix help compile.app" to learn about applications.
  def application do
    [
      mod: {RemoteWs.Application, []},
      extra_applications: [:logger, :crypto]
    ]
  end

  # Specifies which paths to compile per environment.
  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      {:phoenix, "~> 1.7.14"},
      {:bandit, "~> 1.5"},
      {:websock_adapter, "~> 0.5"},
      {:ecto_sql, "~> 3.12"},
      {:postgrex, ">= 0.0.0"},
      {:redix, "~> 1.5"},
      {:gnat, "~> 1.9"},
      {:joken, "~> 2.6"},
      {:jason, "~> 1.4"},

      # OpenTelemetry. Traces are a stable signal in the Erlang SDK; metrics and
      # logs still live in `opentelemetry_experimental`, which is where
      # `otel_metric_reader` and the `otel_log_handler` logger handler come from
      # — so all three signals need it. See lib/remote_ws/telemetry.ex.
      {:opentelemetry, "~> 1.7"},
      {:opentelemetry_api, "~> 1.5"},
      {:opentelemetry_exporter, "~> 1.11"},
      {:opentelemetry_api_experimental, "~> 0.6"},
      {:opentelemetry_experimental, "~> 0.6"},
      {:opentelemetry_phoenix, "~> 2.0"},
      {:opentelemetry_bandit, "~> 0.3"},
      {:opentelemetry_ecto, "~> 1.2"},
      {:opentelemetry_redix, "~> 0.1"}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get"],
      test: ["test"]
    ]
  end
end
