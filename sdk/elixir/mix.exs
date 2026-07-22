defmodule Rocksky.MixProject do
  use Mix.Project

  @version "0.3.0"
  @source_url "https://github.com/tsirysndr/rocksky"

  def project do
    [
      app: :rocksky_ex,
      version: @version,
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      description: description(),
      package: package(),
      docs: docs(),
      name: "Rocksky",
      source_url: @source_url
    ]
  end

  def application do
    [
      extra_applications: [:logger]
    ]
  end

  defp deps do
    [
      # Native core (Rustler NIF). Published builds depend on the Hex
      # `rocksky_erl` package (its loader fetches the native lib on first use);
      # monorepo dev sets ROCKSKY_ERL_PATH=../erlang for the local build.
      {:rocksky_erl, rocksky_erl_dep()},
      {:ex_doc, "~> 0.34", only: :dev, runtime: false}
    ]
  end

  defp rocksky_erl_dep do
    case System.get_env("ROCKSKY_ERL_PATH") do
      nil -> "~> 0.1"
      path -> [path: path]
    end
  end

  defp description do
    "Elixir SDK for Rocksky — native bindings to the shared Rust core: " <>
      "AppView reads, AT Protocol PDS writes (scrobble, like, follow, shout), " <>
      "and identity hashes."
  end

  defp package do
    [
      maintainers: ["Rocksky"],
      licenses: ["MIT"],
      links: %{"GitHub" => @source_url},
      files: ~w(lib mix.exs README.md LICENSE .formatter.exs)
    ]
  end

  defp docs do
    [
      main: "Rocksky",
      source_ref: "v#{@version}",
      extras: ["README.md"]
    ]
  end
end
