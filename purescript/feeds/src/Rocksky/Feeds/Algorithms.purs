module Rocksky.Feeds.Algorithms where

import Prelude
import Data.Array as Array
import Data.Maybe (Maybe(..))

type Algorithm = { rkey :: String, genre :: Maybe String, needsAuth :: Boolean }

publisherDid :: String
publisherDid = "did:plc:vegqomyce4ssoqs7zwqvgqty"

collection :: String
collection = "app.rocksky.feed.generator"

algorithms :: Array Algorithm
algorithms =
  [ { rkey: "afrobeat", genre: Just "afrobeat", needsAuth: false }
  , { rkey: "afrobeats", genre: Just "afrobeats", needsAuth: false }
  , { rkey: "all", genre: Nothing, needsAuth: false }
  , { rkey: "alternative-metal", genre: Just "alternative metal", needsAuth: false }
  , { rkey: "alternative-rnb", genre: Just "alternative rnb", needsAuth: false }
  , { rkey: "anime", genre: Just "anime", needsAuth: false }
  , { rkey: "art-pop", genre: Just "art pop", needsAuth: false }
  , { rkey: "breakcore", genre: Just "breakcore", needsAuth: false }
  , { rkey: "chicago-drill", genre: Just "chicago drill", needsAuth: false }
  , { rkey: "chillwave", genre: Just "chillwave", needsAuth: false }
  , { rkey: "country-hip-hop", genre: Just "country hip hop", needsAuth: false }
  , { rkey: "crunk", genre: Just "crunk", needsAuth: false }
  , { rkey: "dance-pop", genre: Just "dance pop", needsAuth: false }
  , { rkey: "deep-house", genre: Just "deep house", needsAuth: false }
  , { rkey: "drill", genre: Just "drill", needsAuth: false }
  , { rkey: "dubstep", genre: Just "dubstep", needsAuth: false }
  , { rkey: "emo", genre: Just "emo", needsAuth: false }
  , { rkey: "grunge", genre: Just "grunge", needsAuth: false }
  , { rkey: "hard-rock", genre: Just "hard rock", needsAuth: false }
  , { rkey: "heavy-metal", genre: Just "heavy metal", needsAuth: false }
  , { rkey: "hip-hop", genre: Just "hip hop", needsAuth: false }
  , { rkey: "house", genre: Just "house", needsAuth: false }
  , { rkey: "hyperpop", genre: Just "hyperpop", needsAuth: false }
  , { rkey: "indie", genre: Just "indie", needsAuth: false }
  , { rkey: "indie-rock", genre: Just "indie rock", needsAuth: false }
  , { rkey: "j-pop", genre: Just "j-pop", needsAuth: false }
  , { rkey: "j-rock", genre: Just "j-rock", needsAuth: false }
  , { rkey: "jazz", genre: Just "jazz", needsAuth: false }
  , { rkey: "k-pop", genre: Just "k-pop", needsAuth: false }
  , { rkey: "lo-fi", genre: Just "lo-fi", needsAuth: false }
  , { rkey: "metal", genre: Just "metal", needsAuth: false }
  , { rkey: "metalcore", genre: Just "metalcore", needsAuth: false }
  , { rkey: "midwest-emo", genre: Just "midwest emo", needsAuth: false }
  , { rkey: "nu-metal", genre: Just "nu metal", needsAuth: false }
  , { rkey: "pop-punk", genre: Just "pop punk", needsAuth: false }
  , { rkey: "post-grunge", genre: Just "post-grunge", needsAuth: false }
  , { rkey: "rap", genre: Just "rap", needsAuth: false }
  , { rkey: "rap-metal", genre: Just "rap metal", needsAuth: false }
  , { rkey: "rnb", genre: Just "r&b", needsAuth: false }
  , { rkey: "rock", genre: Just "rock", needsAuth: false }
  , { rkey: "southern-hip-hop", genre: Just "southern hip hop", needsAuth: false }
  , { rkey: "speedcore", genre: Just "speedcore", needsAuth: false }
  , { rkey: "synthwave", genre: Just "synthwave", needsAuth: false }
  , { rkey: "swedish-pop", genre: Just "swedish pop", needsAuth: false }
  , { rkey: "thrash-metal", genre: Just "thrash metal", needsAuth: false }
  , { rkey: "trap", genre: Just "trap", needsAuth: false }
  , { rkey: "trap-soul", genre: Just "trap soul", needsAuth: false }
  , { rkey: "tropical-house", genre: Just "tropical house", needsAuth: false }
  , { rkey: "vaporwave", genre: Just "vaporwave", needsAuth: false }
  , { rkey: "visual-kei", genre: Just "visual kei", needsAuth: false }
  , { rkey: "vocaloid", genre: Just "vocaloid", needsAuth: false }
  , { rkey: "west-coast-hip-hop", genre: Just "west coast hip hop", needsAuth: false }
  ]

find :: String -> String -> Maybe Algorithm
find publisher rkey = if publisher == publisherDid then Array.find (\algo -> algo.rkey == rkey) algorithms else Nothing

uri :: Algorithm -> String
uri algo = "at://" <> publisherDid <> "/" <> collection <> "/" <> algo.rkey
