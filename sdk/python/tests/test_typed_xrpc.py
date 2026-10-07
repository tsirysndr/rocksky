"""Typed API checks without loading the native core or accessing production."""

import importlib
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import ModuleType

import pytest
from pydantic import ValidationError

package = ModuleType("rocksky_typed_test")
package.__path__ = [str(Path(__file__).resolve().parents[1] / "src" / "rocksky")]
sys.modules[package.__name__] = package
models = importlib.import_module("rocksky_typed_test.models")
api = importlib.import_module("rocksky_typed_test.api")
xrpc = importlib.import_module("rocksky_typed_test.xrpc")


def test_required_params_and_aliases():
    with pytest.raises(ValidationError):
        models.GetActorScrobblesParams()
    params = models.GetActorScrobblesParams(did="alice.test", limit=20)
    assert params.model_dump(by_alias=True, exclude_unset=True) == {
        "did": "alice.test",
        "limit": 20,
    }
    with pytest.raises(ValidationError):
        models.GetActorScrobblesParams(did="alice.test", limit="20")


def test_nested_response():
    wire = {"discogs": {"releaseId": 123, "formats": ["Vinyl"], "credits": [{"name": "Producer"}]}}
    album = models.AlbumViewDetailed.model_validate(wire)
    assert album.discogs.release_id == 123
    assert album.discogs.credits[0].name == "Producer"
    assert album.model_dump(by_alias=True, exclude_unset=True) == wire


@pytest.mark.parametrize("wire", [{"title": 42}, {"bpm": "wrong"}])
def test_bad_field_is_not_silently_discarded(wire):
    with pytest.raises(ValidationError):
        models.SongViewDetailed.model_validate(wire)


def test_null_and_fractional_fields():
    song = models.SongViewDetailed.model_validate({"bpm": 123.5, "mbId": None})
    assert song.bpm == 123.5
    assert song.mb_id is None


@pytest.fixture
def server():
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def respond(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            seen.append((self.command, self.path, self.headers.get("Authorization"), body))
            status = 429 if "test.fail" in self.path else 200
            response = (
                b'{"error":"RateLimitExceeded"}'
                if status == 429
                else b'{"title":"Track","mbId":"recording-id"}'
            )
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

        do_GET = respond
        do_POST = respond

    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield (
            api.XrpcClient(endpoint=f"http://127.0.0.1:{httpd.server_port}", token="test-token"),
            seen,
        )
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join()


def test_raw_arrays_bool_body_and_http_status(server):
    client, seen = server
    response = client.raw(
        "POST",
        "app.rocksky.test.echo",
        params={"ids": ["a b", "c"], "enabled": True},
        body={"name": "Example", "value": None},
    )
    assert response.status == 200
    method, path, auth, body = seen[-1]
    assert method == "POST"
    assert "ids=a+b&ids=c&enabled=true" in path
    assert auth == "Bearer test-token"
    assert json.loads(body) == {"name": "Example", "value": None}
    response = client.raw("GET", "app.rocksky.test.fail")
    assert response.status == 429
    with pytest.raises(xrpc.XrpcError) as error:
        response.raise_for_status()
    assert error.value.status == 429


def test_typed_endpoint_returns_model(server):
    client, seen = server
    song = client.song_get_song(models.SongGetSongParams(mbid="recording-id"))
    assert isinstance(song, models.SongViewDetailed)
    assert song.title == "Track"
    assert "mbid=recording-id" in seen[-1][1]
