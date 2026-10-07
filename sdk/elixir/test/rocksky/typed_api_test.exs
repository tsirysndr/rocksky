defmodule Rocksky.TypedApiTest do
  use ExUnit.Case
  alias Rocksky.Models

  test "typed params serialize with wire aliases and omit absent values" do
    params = %Models.GetActorScrobblesParams{did: "alice.test", limit: 20}

    assert Models.GetActorScrobblesParams.encode(params) == %{
             "did" => "alice.test",
             "limit" => 20
           }

    assert {:error, _} = Models.GetActorScrobblesParams.decode(%{})
  end

  test "nested Discogs data becomes structs" do
    wire = %{
      "discogs" => %{
        "releaseId" => 123,
        "formats" => ["Vinyl"],
        "credits" => [%{"name" => "Producer"}]
      }
    }

    assert {:ok, album} = Models.AlbumViewDetailed.decode(wire)
    assert album.discogs.release_id == 123
    assert hd(album.discogs.credits).name == "Producer"
    assert Models.AlbumViewDetailed.encode(album) == wire
  end

  test "malformed optional fields fail instead of silently disappearing" do
    assert {:error, _} = Models.SongViewDetailed.decode(%{"title" => 42})
    assert {:error, _} = Models.AlbumViewDetailed.decode(%{"discogs" => %{"formats" => [42]}})
  end

  test "JSON null and fractional fields are preserved" do
    wire = :json.decode(~s({"bpm":123.5,"mbId":null})) |> Rocksky.Codec.from_wire()
    assert {:ok, song} = Models.SongViewDetailed.decode(wire)
    assert song.bpm == 123.5
    assert song.mb_id == nil
  end

  test "raw transport keeps params, JSON body, bearer and HTTP failure status" do
    {client, server} = server(429, ~s({"error":"RateLimitExceeded"}))
    client = %{client | token: "test-token"}

    assert {:ok, %{status: 429}} =
             Rocksky.Xrpc.raw(
               client,
               :post,
               "app.rocksky.test",
               %{"ids" => ["a b", "c"], "enabled" => true},
               %{"title" => "Track"}
             )

    request = Task.await(server)
    assert request =~ "ids=a+b&ids=c"
    assert request =~ "enabled=true"
    assert String.downcase(request) =~ "authorization: bearer test-token"
    assert request =~ ~s({"title":"Track"})
  end

  test "typed transport returns a song struct and reports malformed responses" do
    {client, server} = server(200, ~s({"title":"Track","mbId":"recording-id"}))

    assert {:ok, song} =
             Rocksky.Api.song_get_song(client, %Models.SongGetSongParams{uri: "at://test"})

    assert song.title == "Track"
    assert song.mb_id == "recording-id"
    Task.await(server)
    {client, server} = server(200, ~s({"title":42}))
    assert {:error, {:decode, _}} = Rocksky.Api.song_get_song(client, %Models.SongGetSongParams{})
    Task.await(server)
  end

  defp server(status, body) do
    {:ok, listener} =
      :gen_tcp.listen(0, [:binary, active: false, reuseaddr: true, ip: {127, 0, 0, 1}])

    {:ok, {_, port}} = :inet.sockname(listener)

    task =
      Task.async(fn ->
        {:ok, socket} = :gen_tcp.accept(listener, 5_000)
        request = read_request(socket, "")

        :ok =
          :gen_tcp.send(
            socket,
            "HTTP/1.1 #{status} Test\r\nContent-Length: #{byte_size(body)}\r\nConnection: close\r\n\r\n" <>
              body
          )

        :gen_tcp.close(socket)
        :gen_tcp.close(listener)
        request
      end)

    {Rocksky.Xrpc.new(endpoint: "http://127.0.0.1:#{port}"), task}
  end

  defp read_request(socket, accumulated) do
    case String.split(accumulated, "\r\n\r\n", parts: 2) do
      [headers, body] ->
        length =
          case Regex.run(~r/content-length: (\d+)/i, headers) do
            [_, n] -> String.to_integer(n)
            _ -> 0
          end

        if byte_size(body) >= length do
          accumulated
        else
          {:ok, more} = :gen_tcp.recv(socket, 0, 5_000)
          read_request(socket, accumulated <> more)
        end

      _ ->
        {:ok, more} = :gen_tcp.recv(socket, 0, 5_000)
        read_request(socket, accumulated <> more)
    end
  end
end
