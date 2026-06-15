"""Resource modules — one per XRPC namespace."""

from .actor import ActorResource
from .album import AlbumResource
from .apikey import ApikeyResource
from .artist import ArtistResource
from .charts import ChartsResource
from .feed import FeedResource
from .graph import FollowList, GraphResource
from .like import LikeResource
from .mirror import MirrorResource
from .player import PlayerResource
from .rockbox import RockboxResource
from .playlist import PlaylistResource
from .scrobble import ScrobbleResource
from .shout import ShoutResource
from .song import SongResource
from .spotify import SpotifyResource
from .stats import StatsResource
from .storage import DropboxResource, GoogleDriveResource

__all__ = [
    "ActorResource",
    "AlbumResource",
    "ApikeyResource",
    "ArtistResource",
    "ChartsResource",
    "DropboxResource",
    "FeedResource",
    "FollowList",
    "GoogleDriveResource",
    "GraphResource",
    "LikeResource",
    "MirrorResource",
    "PlayerResource",
    "RockboxResource",
    "PlaylistResource",
    "ScrobbleResource",
    "ShoutResource",
    "SongResource",
    "SpotifyResource",
    "StatsResource",
]
