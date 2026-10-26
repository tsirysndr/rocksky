import gleam/list
import gleam/result
import rocksky_feeds/types.{type Algorithm, All, Genre}

pub const publisher = "did:plc:vegqomyce4ssoqs7zwqvgqty"

pub fn algorithms() -> List(Algorithm) {
  [
    Genre("afrobeat", "afrobeat"),
    Genre("afrobeats", "afrobeats"),
    All,
    Genre("alternative-metal", "alternative metal"),
    Genre("alternative-rnb", "alternative rnb"),
    Genre("anime", "anime"),
    Genre("art-pop", "art pop"),
    Genre("breakcore", "breakcore"),
    Genre("chicago-drill", "chicago drill"),
    Genre("chillwave", "chillwave"),
    Genre("country-hip-hop", "country hip hop"),
    Genre("crunk", "crunk"),
    Genre("dance-pop", "dance pop"),
    Genre("deep-house", "deep house"),
    Genre("drill", "drill"),
    Genre("dubstep", "dubstep"),
    Genre("emo", "emo"),
    Genre("grunge", "grunge"),
    Genre("hard-rock", "hard rock"),
    Genre("heavy-metal", "heavy metal"),
    Genre("hip-hop", "hip hop"),
    Genre("house", "house"),
    Genre("hyperpop", "hyperpop"),
    Genre("indie", "indie"),
    Genre("indie-rock", "indie rock"),
    Genre("j-pop", "j-pop"),
    Genre("j-rock", "j-rock"),
    Genre("jazz", "jazz"),
    Genre("k-pop", "k-pop"),
    Genre("lo-fi", "lo-fi"),
    Genre("metal", "metal"),
    Genre("metalcore", "metalcore"),
    Genre("midwest-emo", "midwest emo"),
    Genre("nu-metal", "nu metal"),
    Genre("pop-punk", "pop punk"),
    Genre("post-grunge", "post-grunge"),
    Genre("rap", "rap"),
    Genre("rap-metal", "rap metal"),
    Genre("rnb", "r&b"),
    Genre("rock", "rock"),
    Genre("southern-hip-hop", "southern hip hop"),
    Genre("speedcore", "speedcore"),
    Genre("synthwave", "synthwave"),
    Genre("swedish-pop", "swedish pop"),
    Genre("thrash-metal", "thrash metal"),
    Genre("trap", "trap"),
    Genre("trap-soul", "trap soul"),
    Genre("tropical-house", "tropical house"),
    Genre("vaporwave", "vaporwave"),
    Genre("visual-kei", "visual kei"),
    Genre("vocaloid", "vocaloid"),
    Genre("west-coast-hip-hop", "west coast hip hop"),
  ]
}

pub fn key(algorithm: Algorithm) -> String {
  case algorithm {
    All -> "all"
    Genre(key, _) -> key
  }
}

pub fn uri(algorithm: Algorithm) -> String {
  "at://" <> publisher <> "/app.rocksky.feed.generator/" <> key(algorithm)
}

pub fn find(feed: String) -> Result(Algorithm, Nil) {
  algorithms()
  |> list.find(fn(algorithm) { uri(algorithm) == feed })
  |> result.map_error(fn(_) { Nil })
}
