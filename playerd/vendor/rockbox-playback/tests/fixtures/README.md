`he-aac-tone.m4a` is a synthetic four-second, 440 Hz stereo tone used to
regress HE-AAC seeking through finite HTTP/UPnP sources. It contains no music.

Generated on macOS using:

```sh
ffmpeg -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=4' \
  -ac 2 -c:a aac_at -profile:a 4 -b:a 64k he-aac-tone.m4a
```
