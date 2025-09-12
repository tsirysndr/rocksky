# Rocksky Lexicons

## `app.rocksky.album`

### Example record
```json
{
  "year": 2022,
  "$type": "app.rocksky.album",
  "title": "CRASH (Deluxe)",
  "artist": "Charli xcx",
  "albumArt": {
    "$type": "blob",
    "ref": {
      "$link": "bafkreigxbmkowezanfdgn4qnvsl2tfbqqjoxdrkaqk7tjst3x6kcklwazy"
    },
    "mimeType": "image/jpeg",
    "size": 316543
  },
  "createdAt": "2025-09-09T11:01:35.792Z",
  "releaseDate": "2022-03-18T00:00:00.000Z"
}
```

## `app.rocksky.artist`

### Example record
```json
{
  "name": "Lady Gaga",
  "$type": "app.rocksky.artist",
  "picture": {
    "$type": "blob",
    "ref": {
      "$link": "bafkreiggssa2uk3m6cdkf4y7mqlgedl5mqsvljclne5me54giw3tkxa5w4"
    },
    "mimeType": "image/jpeg",
    "size": 80534
  },
  "createdAt": "2025-04-09T20:55:13.074Z"
}
```

## `app.rocksky.like`

### Example record
```json
{
  "$type": "app.rocksky.like",
  "subject": {
    "cid": "bafyreifsx2d2vh5mckx5l7ozq5bibpqsznezgvogti4orlirjwlkor4lcy",
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.song/3lymtp5nuqc25"
  },
  "createdAt": "2025-09-12T08:27:37.871Z"
}
```

## `app.rocksky.playlist`

### Example record
```json
{
  "name": "Hip Hop US",
  "$type": "app.rocksky.playlist",
  "picture": {
    "$type": "blob",
    "ref": {
      "$link": "bafkreiclplbmi5s2tocvzp3227rsquh2esbtsxuaejwe2ajkaalznico3i"
    },
    "mimeType": "image/jpeg",
    "size": 50247
  },
  "createdAt": "2025-03-09T13:07:08.176Z",
  "description": "",
  "spotifyLink": "https://open.spotify.com/playlist/40fEXcsbQix2oK4QzRPVAl"
}
```

## `app.rocksky.scrobble`

### Example record
```json
{
  "year": 2022,
  "$type": "app.rocksky.scrobble",
  "album": "CRASH (Deluxe)",
  "title": "Every Rule",
  "artist": "Charli xcx",
  "lyrics": "[00:10.46] When I met you, it was tragic\n[00:13.01] Chemistry something like magic\n[00:15.74] You were with somebody else long term\n[00:18.12] And I was with somebody else as well\n[00:20.87] Met up late night by the Bowery\n[00:23.51] And in the morning, we got coffee\n[00:26.15] Acting like strangers and told no friends\n[00:28.78] It wasn't easy to pretend\n[00:30.33] And we know that it's wrong, but it feels real fun\n[00:33.29] Sneaking around, falling deep in love\n[00:35.66] But sometimes I get scared\n[00:36.86] 'Cause I know it's unfair\n[00:39.01] I'm hurting someone else instead\n[00:42.68] I'm breaking every rule for you\n[00:47.97] You're breaking every rule for me\n[00:53.19] I'm breaking every rule for you\n[00:56.61] But I gotta say\n[00:57.90] I want it this way\n[00:59.82] These moments really set me free\n[01:02.69] Ah, ah, ah, ah, ah, ah\n[01:07.36] Ah, ah, ah, ah, ah, ah, ah, ah\n[01:13.02] Ah, ah, ah, ah, ah, ah\n[01:17.63] Ah, ah, ah, ah, ah, ah, ah, ah\n[01:23.45] Straight away, we started falling\n[01:26.00] Conversation never boring\n[01:28.81] When your lips brushed up against my skin\n[01:31.34] All I wanted was to let you in\n[01:33.80] I wonder if people will notice\n[01:36.54] Said you find it so hard to focus\n[01:39.12] Cigarettes up on the balcony\n[01:41.87] Wrapped up in nothing but sheets\n[01:43.31] And we know that it's wrong, but it feels real fun\n[01:46.33] Sneaking around, falling deep in love\n[01:48.52] But sometimes I get scared\n[01:49.93] 'Cause I know it's unfair\n[01:51.81] I'm hurting someone else instead\n[01:55.84] I'm breaking every rule for you\n[02:01.08] You're breaking every rule for me\n[02:06.20] I'm breaking every rule for you\n[02:09.88] But I gotta say\n[02:10.98] I want it this way\n[02:12.85] These moments really set me free\n[02:15.74] Ah, ah, ah, ah, ah, ah\n[02:20.29] Ah, ah, ah, ah, ah, ah, ah, ah\n[02:26.14] Ah, ah, ah, ah, ah, ah\n[02:30.71] Ah, ah, ah, ah, ah, ah, ah, ah\n[02:35.98] ",
  "albumArt": {
    "$type": "blob",
    "ref": {
      "$link": "bafkreigxbmkowezanfdgn4qnvsl2tfbqqjoxdrkaqk7tjst3x6kcklwazy"
    },
    "mimeType": "image/jpeg",
    "size": 316543
  },
  "composer": "Alexander Guy Cook",
  "duration": 183120,
  "createdAt": "2025-09-12T08:42:04.122Z",
  "discNumber": 1,
  "albumArtist": "Charli xcx",
  "releaseDate": "2022-03-18T00:00:00.000Z",
  "trackNumber": 9,
  "copyrightMessage": "℗ 2021 Warner Music UK Limited"
}
```

## `app.rocksky.shout`

### Example record
```json
{
  "$type": "app.rocksky.shout",
  "message": "nice",
  "subject": {
    "cid": "bafyreiee6ceyr65gepzufgkx5gcfa6fzksb3w22rwlmztsz2v73el2jzj4",
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.artist/3lhlnky67uk2k"
  },
  "createdAt": "2025-02-16T14:25:51.697Z"
}
```

## `app.rocksky.song`

### Example record
```json
{
  "year": 2017,
  "$type": "app.rocksky.song",
  "album": "Pop 2",
  "title": "Delicious (feat. Tommy Cash)",
  "artist": "Charli xcx, Tommy Cash",
  "lyrics": "[00:02.11] E-e-e-e-X-C-X\n[00:06.03] Это очень вкусно\n[00:08.07] Charli, Cash\n[00:11.35] Cash, cash, cash, cash, cash\n[00:13.75] I always think about you when I'm high\n[00:17.10] I wanna hear you whisper on the telephone, yeah\n[00:20.46] You call me up and then I'm satisfied\n[00:23.80] I touch myself and then I'm not alone no more\n[00:27.29] I always think about you when I'm high\n[00:30.56] I wanna hear you whisper on the telephone, yeah\n[00:34.08] You call me up and then I'm satisfied\n[00:37.37] Do somethin' special to me\n[00:41.02] Wanna take your picture, you're so delicious\n[00:44.52] Gimme icy vision, the head so clever\n[00:47.97] Can you keep me with ya?\n[00:49.66] Gotta touch your treasure, icy like November\n[00:53.04] The vicious kingdom\n[00:54.76] Wanna take your picture, you're so delicious\n[00:58.11] Like the architecture, I won't forget you\n[01:01.46] Got me in the bathroom, got me in the mirror\n[01:04.88] Puttin' on the pressure\n[01:05.96] (E-e-X-C-X)\n[01:07.85] I always think about you when I'm high\n[01:11.13] I wanna hear you whisper on the telephone, yeah\n[01:14.64] You call me up and then I'm satisfied\n[01:17.90] I touch myself and then I'm not alone no more\n[01:21.59] I always think about you when I'm high\n[01:24.74] I wanna hear you whisper on the telephone, yeah\n[01:28.19] You call me up and then I'm satisfied\n[01:31.43] Do somethin' special to me\n[01:35.78] Oh\n[01:37.51] There's no wifi in forest\n[01:39.26] I found a better connection (Connect)\n[01:41.25] No mirrors nearby, but I see a better reflection\n[01:44.46] I was fucked by the nature, we didn't use protection\n[01:47.72] Made a lot of trees, they are now in a book section\n[01:51.15] No cameras, no lights, but a lot of action (Flash)\n[01:54.43] Yeah, Summer turnin' Winter, c'mon little mama Jackson\n[01:59.02] Slow like water, no Beats by Dre, but beats by your father\n[02:02.74] (Delicious, you're delicious, man)\n[02:05.30] I always think about you when I'm high, yeah, yeah\n[02:08.50] I wanna hear you whisper on the telephone, yeah, yeah\n[02:12.01] You call me up then I'm satisfied, yeah, yeah\n[02:15.62] Touch myself then I'm not alone, yeah\n[02:18.83] I always think about you when I'm high, high, high, high\n[02:21.99] I wanna hear you whisper on the telephone, yeah\n[02:25.68] You call me up and I'm satis-satisfied, yeah, ye-\n[02:28.98] Boom clap, the sound of my heart\n[02:30.96] Алё?\n[02:32.10] Tell it to me, do it straightforward\n[02:33.83] Run it up and then we fast forward\n[02:35.44] Tint the windows on the Range Rover\n[02:37.17] Drive it in like you're the best chauffeur\n[02:39.29] Switch it up, bipolar\n[02:40.58] Colorado, how you take over\n[02:42.20] Got an angel, got me real closer\n[02:43.99] Running it just like a halo, yeah\n[02:46.06] Never let me go, never let me go, no\n[02:49.44] Want a little more, when it rains, it pours, yeah\n[02:53.09] I'ma care for you, run it up and then we fast forward\n[02:55.89] Leave a message here, record on, yeah\n[02:58.73] Yeah\n[02:59.40] I always think about you when I'm high (When I'm high)\n[03:02.66] I wanna hear you whisper on the telephone, yeah (Tele-tele)\n[03:06.19] You call me up and then I'm satisfied\n[03:09.57] I touch myself and then I'm not alone no more (No more)\n[03:12.89] I always think about you when I'm high (When I'm high)\n[03:16.54] I wanna hear you whisper on the telephone, yeah\n[03:19.60] You call me up and then I'm satisfied\n[03:22.01] (Сука, почему ты мне не звонишь, нахуй? Почему ты мне не звонишь, а?)\n[03:23.19] I touch myself and then I'm not alone no more\n[03:26.71] I always think about you when I'm high (When I'm high)\n[03:29.72] I wanna hear you whisper on the telephone, yeah\n[03:33.10] You call me up and then I'm satisfied\n[03:36.63] I touch myself and then I'm not alone no more\n[03:40.25] I always think about you when I'm high\n[03:42.10] I wanna hear you whisper on the telephone, yeah\n[03:46.72] You call me up and then I'm satisfied\n[03:50.02] Do somethin' special to me\n[03:53.61] \n[04:08.65] Delicious featuring Tommy\n[04:15.32] Delicious featuring Tommy\n[04:26.86] Delicious\n[04:27.28] ",
  "albumArt": {
    "$type": "blob",
    "ref": {
      "$link": "bafkreicv6hmvtfzmjd6ehqkuc7a32non7x5qsbsvety4gi6ch23rldcbnq"
    },
    "mimeType": "image/jpeg",
    "size": 241055
  },
  "duration": 272753,
  "createdAt": "2025-09-12T06:52:34.039Z",
  "discNumber": 1,
  "albumArtist": "Charli xcx",
  "releaseDate": "2017-12-15T00:00:00.000Z",
  "trackNumber": 7,
  "copyrightMessage": "℗ 2017 Warner Music UK Limited"
}
```