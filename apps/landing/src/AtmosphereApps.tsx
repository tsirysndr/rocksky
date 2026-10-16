import { useState } from "react";
import { Pause, Play } from "lucide-react";

// App marks from Grain's public Atmosphere account explainer.
const apps = [
  {
    name: "Bluesky",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-bluesky.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Tangled",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-tangled.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Anisota",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-anisota.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Beacon Bits",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-beacon-bits.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Eurosky",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-eurosky.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Flashes",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-flashes.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Gander",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-gander.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Germ",
    src: new URL("../../shared/atmosphere-icons/atmo-germ.jpg", import.meta.url)
      .href,
  },
  {
    name: "Leaflet",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-leaflet.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Northsky",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-northsky.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Offprint",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-offprint.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Pckt",
    src: new URL("../../shared/atmosphere-icons/atmo-pckt.jpg", import.meta.url)
      .href,
  },
  {
    name: "Plyr",
    src: new URL("../../shared/atmosphere-icons/atmo-plyr.jpg", import.meta.url)
      .href,
  },
  {
    name: "Popfeed",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-popfeed.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Blento",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-blento.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Semble",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-semble.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Skylight",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-skylight.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Blacksky",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-blacksky.jpg",
      import.meta.url,
    ).href,
  },
  {
    name: "Spark",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-spark.png",
      import.meta.url,
    ).href,
  },
  {
    name: "Streamplace",
    src: new URL(
      "../../shared/atmosphere-icons/atmo-stream-place.jpg",
      import.meta.url,
    ).href,
  },
];

export default function AtmosphereApps() {
  const [paused, setPaused] = useState(false);
  return (
    <div className="atmosphere-apps">
      <div
        className="atmosphere-apps-strip"
        role="img"
        aria-label={`Apps in the Atmosphere: ${apps.map((app) => app.name).join(", ")}`}
      >
        <div
          className="atmosphere-apps-track"
          style={{ animationPlayState: paused ? "paused" : "running" }}
          aria-hidden="true"
        >
          {[0, 1].map((copy) => (
            <div className="atmosphere-apps-group" key={copy}>
              {apps.map((app) => (
                <img
                  key={app.name}
                  src={app.src}
                  alt=""
                  title={app.name}
                  width={36}
                  height={36}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="atmosphere-apps-footer">
        <a
          href="https://atmosphereaccount.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          What is an atmosphere account?
        </a>
        <button
          type="button"
          className="atmosphere-apps-pause"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? "Play app animation" : "Pause app animation"}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
      </div>
    </div>
  );
}
