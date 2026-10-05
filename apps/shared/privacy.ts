import type { LegalDocument, LegalSection } from "./legal";

const sections: LegalSection[] = [
  {
    title: "1. The short version",
    blocks: [
      {
        type: "list",
        items: [
          "Rocksky is built on the AT Protocol. Your scrobbles, likes, playlists, shouts and follows are written to your own repository as public records.",
          "Public means public: anyone can read them, and other services can keep their own copies.",
          "Uploaded audio files are private to your account.",
          "Scrobbling from other apps on your phone is off until you turn it on, and you can exclude individual apps.",
          "We do not sell your data, and we do not use advertising networks or third-party tracking SDKs.",
        ],
      },
    ],
  },
  {
    title: "2. Who is responsible",
    blocks: [
      {
        type: "contact",
        text: "Rocksky is operated as an independent project. For any privacy question, or to exercise any right described below, contact:",
        email: "support@rocksky.app",
      },
    ],
  },
  {
    title: "3. Information you give us",
    blocks: [
      {
        type: "text",
        text: "You sign in with an existing AT Protocol identity rather than creating a password with us. From that sign-in we receive and store:",
      },
      {
        type: "list",
        items: [
          "Your decentralized identifier (DID) and handle",
          "The address of your personal data server (PDS)",
          "OAuth tokens that let us read and write the records you authorize",
        ],
      },
      {
        type: "text",
        text: "We never receive your account password, and we cannot read anything in your repository that you have not granted access to.",
      },
      {
        type: "text",
        text: "You may also give us content directly: audio files you upload, playlists, shouts, likes, profile preferences, and API keys or access tokens you create.",
      },
    ],
  },
  {
    title: "4. Information created when you listen",
    blocks: [
      {
        type: "text",
        text: "A scrobble is a record that you played something. Each one contains:",
      },
      {
        type: "list",
        items: [
          "Track title, artist, album and album artist",
          "Track duration and the time you played it",
          "Where the play came from — the application, player or device name",
          "Identifiers used to match the track to a release, such as an ISRC or MusicBrainz id",
        ],
      },
      {
        type: "text",
        text: "To fill in missing details we may look up a track with external music metadata services, including Spotify, Deezer and MusicBrainz. Those lookups send the track and artist name, never your identity.",
      },
    ],
  },
  {
    title: "5. What is public, and what that means",
    blocks: [
      {
        type: "text",
        text: "This is the most important thing to understand about Rocksky. Scrobbles, likes, playlists, shouts and follows are stored as records in your AT Protocol repository, and those records are public by design. They are readable by anyone, including people without a Rocksky account, and they are distributed to other services on the network.",
      },
      {
        type: "text",
        text: "Practical consequences you should expect:",
      },
      {
        type: "list",
        items: [
          "Your listening history, including timestamps, can be read by anyone",
          "Other applications, indexes and archives may keep their own copies",
          "Deleting a record removes it from your repository and from Rocksky, but we cannot delete copies that other services already collected",
          "Your profile and listening activity are reachable through our public API",
        ],
      },
      {
        type: "text",
        text: "If you do not want a listen to be public, do not scrobble it. Uploaded audio files are not published this way and remain private to your account.",
      },
    ],
  },
  {
    title: "6. Scrobbling from other apps on your phone",
    blocks: [
      {
        type: "text",
        text: "The Rocksky Android app can scrobble music played by other applications. To do this it needs notification access, which you grant explicitly in Android settings and can withdraw at any time. The feature does nothing until you enable it.",
      },
      {
        type: "text",
        text: "While enabled, the app observes the media sessions of other players and reads only what it needs to identify a track:",
      },
      {
        type: "list",
        items: [
          "Title, artist, album and album artist",
          "Track duration, playback position and the media id reported by the player",
          "The package name of the application that is playing",
        ],
      },
      {
        type: "text",
        text: "It does not read the content of your messages, emails or any other notification unrelated to music playback. You can exclude specific applications, and excluded applications are ignored entirely.",
      },
      {
        type: "text",
        text: "Pending scrobbles are queued on your device so that listening works offline, and your sign-in credentials are encrypted on the device. The queue is uploaded when a connection is available and then cleared.",
      },
    ],
  },
  {
    title: "7. Services you choose to connect",
    blocks: [
      {
        type: "text",
        text: "You can connect third-party accounts to import a library or scrobble from them. These connections are optional and each one is separate:",
      },
      {
        type: "list",
        items: [
          "Spotify — to scrobble playback and read track metadata",
          "Dropbox and Google Drive — to read audio files you select for your library",
        ],
      },
      {
        type: "text",
        text: "We store the access tokens needed to act on your behalf for as long as the connection exists, and we request the narrowest access the feature allows. Data obtained from Google APIs is used only to provide the feature you connected it for, and is not transferred to anyone else except as needed to operate the service, with your consent, or where the law requires it. Disconnecting a service deletes the stored tokens, and you can also revoke access from that provider's own settings.",
      },
    ],
  },
  {
    title: "8. Using your own storage",
    blocks: [
      {
        type: "text",
        text: "Rocksky lets you attach your own S3-compatible storage bucket instead of our managed storage. If you do, we store the endpoint, region, bucket name and credentials you provide so that we can read and write your audio files there. Your files stay in your bucket and under your control, and removing the provider deletes the stored credentials.",
      },
    ],
  },
  {
    title: "9. Technical and operational information",
    blocks: [
      {
        type: "text",
        text: "Like any service on the internet, our servers record information needed to run and protect the platform:",
      },
      {
        type: "list",
        items: [
          "IP address, approximate region and user agent",
          "Request logs, error reports and performance traces",
          "Device and player names reported by clients you have signed in",
        ],
      },
      {
        type: "text",
        text: "Listening statistics shown in the app — your charts, top artists and history — are computed by us from your own scrobbles. We do not embed advertising networks or third-party analytics or tracking SDKs in our applications.",
      },
    ],
  },
  {
    title: "10. How we use this information",
    blocks: [
      { type: "text", text: "We use the information above to:" },
      {
        type: "list",
        items: [
          "Provide scrobbling, your library, playback and your listening history",
          "Match what you play to the correct track, album and artist",
          "Produce your statistics, charts and recommendations",
          "Operate, debug, secure and improve the service",
          "Detect automated or fraudulent scrobbling that distorts charts for everyone",
          "Comply with legal obligations and respond to valid legal requests",
        ],
      },
      {
        type: "text",
        text: "Accounts flagged by our automated abuse detection may be excluded from public charts. If you believe your account was flagged in error, contact us and we will review it.",
      },
    ],
  },
  {
    title: "11. Who we share it with",
    blocks: [
      {
        type: "text",
        text: "We do not sell your personal information, and we do not share it for advertising. Information reaches others only in these ways:",
      },
      {
        type: "list",
        items: [
          "Publicly, through the AT Protocol records described in section 5",
          "Infrastructure providers that host, store and deliver the service on our behalf",
          "Music metadata services, for the anonymous track lookups described in section 4",
          "Services you explicitly connected, as described in section 7",
          "When required by law, or to protect the rights and safety of users and the platform",
        ],
      },
    ],
  },
  {
    title: "12. How long we keep it",
    blocks: [
      {
        type: "list",
        items: [
          "Account data, scrobbles and uploads: while your account exists, until you delete them",
          "OAuth tokens and storage credentials: until you disconnect that service",
          "Logs and performance traces: a short operational window, then deleted or aggregated",
          "On-device scrobble queues: until successfully uploaded",
        ],
      },
      {
        type: "text",
        text: "Public records already distributed across the AT Protocol network are outside our control once published. See section 5.",
      },
    ],
  },
  {
    title: "13. Your rights and choices",
    blocks: [
      { type: "text", text: "You can, at any time:" },
      {
        type: "list",
        items: [
          "Turn scrobbling off, or exclude individual applications from it",
          "Withdraw notification access from the mobile app in Android settings",
          "Disconnect any third-party service and remove your storage provider",
          "Delete individual scrobbles, uploads, playlists and shouts",
          "Revoke API keys and access tokens you created",
          "Request a copy of the data we hold about you, or ask us to correct or delete it",
          "Delete your account, which removes the data we hold for it",
        ],
      },
      {
        type: "text",
        text: "Depending on where you live you may also have the right to object to or restrict certain processing, and to complain to your local data protection authority. Because your records live in your own AT Protocol repository, you can additionally manage or move them independently of Rocksky.",
      },
    ],
  },
  {
    title: "14. Security",
    blocks: [
      {
        type: "text",
        text: "We use encryption in transit, encrypt stored credentials, and limit internal access to what is needed to operate the service. No service can promise perfect security, and you are responsible for keeping your own device and identity credentials safe.",
      },
    ],
  },
  {
    title: "15. International transfers",
    blocks: [
      {
        type: "text",
        text: "Rocksky runs on infrastructure located in several countries, and the AT Protocol network is global by nature. Using the service involves transferring information across borders, including to countries whose data protection laws differ from your own.",
      },
    ],
  },
  {
    title: "16. Children",
    blocks: [
      {
        type: "text",
        text: "Rocksky is not directed to children and is not intended for use by anyone under 13, or under the minimum age of digital consent where they live if that age is higher. We do not knowingly collect information from them. If you believe a child has provided us information, contact us and we will delete it.",
      },
    ],
  },
  {
    title: "17. Changes to this policy",
    blocks: [
      {
        type: "text",
        text: "We may update this policy as the service changes. The date above always reflects the current version, and we will give notice in the app for changes that materially affect how we handle your information.",
      },
    ],
  },
  {
    title: "18. Contact",
    blocks: [
      {
        type: "contact",
        text: "For privacy requests, data deletion, or any question about this policy, contact:",
        email: "support@rocksky.app",
      },
    ],
  },
];

export const PRIVACY: LegalDocument = {
  title: "Privacy Policy",
  lastUpdated: "October 5, 2026",
  intro:
    "This policy explains what information Rocksky collects, why, and what you can do about it. Rocksky is built on the AT Protocol, which makes it different from most music services in one important way: much of what you create is published as public data under your own identity. Section 5 explains exactly what that means.",
  sections,
};
