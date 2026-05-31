"""Charts resource tests."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import respx

from rocksky import Client


@respx.mock
async def test_top_tracks_passes_dates(mock_api: respx.Router, base_url: str) -> None:
    route = mock_api.get("/xrpc/app.rocksky.charts.getTopTracks").mock(
        return_value=httpx.Response(
            200, json={"tracks": [{"id": "t1", "title": "X", "artist": "Y"}]}
        )
    )
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2026, 5, 1, tzinfo=timezone.utc)
    async with Client(base_url=base_url) as c:
        tracks = await c.charts.top_tracks(limit=5, start_date=start, end_date=end)
    assert len(tracks) == 1
    params = route.calls.last.request.url.params
    assert params["limit"] == "5"
    assert params["startDate"].startswith("2026-01-01")
    assert params["endDate"].startswith("2026-05-01")


@respx.mock
async def test_top_artists(mock_api: respx.Router, base_url: str) -> None:
    mock_api.get("/xrpc/app.rocksky.charts.getTopArtists").mock(
        return_value=httpx.Response(
            200,
            json={"artists": [{"id": "a", "name": "Kate Bush"}]},
        )
    )
    async with Client(base_url=base_url) as c:
        artists = await c.charts.top_artists(limit=3)
    assert [a.name for a in artists] == ["Kate Bush"]


@respx.mock
async def test_scrobbles_chart_query_param_names(
    mock_api: respx.Router, base_url: str
) -> None:
    """The server lexicon uses lowercase keys (artisturi/albumuri/songuri/from/to)."""
    route = mock_api.get("/xrpc/app.rocksky.charts.getScrobblesChart").mock(
        return_value=httpx.Response(200, json={"buckets": []})
    )
    async with Client(base_url=base_url) as c:
        await c.charts.scrobbles_chart(
            artist_uri="at://artist",
            from_=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
    params = route.calls.last.request.url.params
    assert "artisturi" in params
    assert "from" in params
    assert params["artisturi"] == "at://artist"
