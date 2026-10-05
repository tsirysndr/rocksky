export type TosBlock =
  | { type: "text"; text: string }
  | { type: "list"; items: string[] }
  | { type: "contact"; text: string; email: string };

export type TosSection = { title: string; blocks: TosBlock[] };

export const TOS_LAST_UPDATED = "May 28, 2026";

export const TOS_INTRO =
  'Welcome to Rocksky. By accessing or using Rocksky, you agree to these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the service.';

export const TOS_SECTIONS: TosSection[] = [
  {
    title: "1. About Rocksky",
    blocks: [
      {
        type: "text",
        text: "Rocksky is a music tracking, discovery, and personal media platform built on the AT Protocol. Features may include:",
      },
      {
        type: "list",
        items: [
          "Music scrobbling and listening history",
          "Personal music uploads",
          "Streaming through compatible clients",
          "Social and discovery features",
          "APIs and developer tools",
        ],
      },
      {
        type: "text",
        text: "Rocksky may evolve over time and features may change without notice.",
      },
    ],
  },
  {
    title: "2. Eligibility",
    blocks: [
      {
        type: "text",
        text: "You must be legally allowed to use the service in your jurisdiction. You are responsible for complying with local laws and regulations when using Rocksky.",
      },
    ],
  },
  {
    title: "3. User Accounts",
    blocks: [
      { type: "text", text: "You are responsible for:" },
      {
        type: "list",
        items: [
          "Maintaining the security of your account",
          "Keeping your credentials secure",
          "Activities performed through your account",
        ],
      },
      { type: "text", text: "You must not:" },
      {
        type: "list",
        items: [
          "Impersonate others",
          "Attempt unauthorized access",
          "Abuse or disrupt the platform",
        ],
      },
      {
        type: "text",
        text: "We may suspend or terminate accounts that violate these Terms.",
      },
    ],
  },
  {
    title: "4. Personal Music Uploads",
    blocks: [
      {
        type: "text",
        text: "Rocksky may allow users to upload audio files for personal streaming and playback.",
      },
      {
        type: "text",
        text: "You may only upload content that you own, or that you have the legal right or permission to use.",
      },
      { type: "text", text: "You must not upload:" },
      {
        type: "list",
        items: [
          "Copyrighted material without authorization",
          "Pirated content",
          "Malicious files",
          "Illegal content",
        ],
      },
      {
        type: "text",
        text: "Uploaded music libraries are private to the account owner unless explicitly stated otherwise by the platform. Rocksky does not claim ownership of your uploaded content.",
      },
    ],
  },
  {
    title: "5. Copyright Policy",
    blocks: [
      {
        type: "text",
        text: "Rocksky respects intellectual property rights. If you believe content hosted through Rocksky infringes your copyright, you may submit a takedown request containing:",
      },
      {
        type: "list",
        items: [
          "Identification of the copyrighted work",
          "Identification of the allegedly infringing material",
          "Your contact information",
          "A statement that you believe the use is unauthorized",
        ],
      },
      {
        type: "text",
        text: "Rocksky reserves the right to remove content, restrict access, and suspend repeat infringers.",
      },
    ],
  },
  {
    title: "6. APIs and Third-Party Clients",
    blocks: [
      {
        type: "text",
        text: "Rocksky may provide compatibility with third-party applications and APIs, including Subsonic/Navidrome-compatible clients. Rocksky is not responsible for:",
      },
      {
        type: "list",
        items: [
          "Third-party applications or integrations",
          "External software behavior",
          "Data loss caused by third-party tools",
        ],
      },
      { type: "text", text: "Use third-party clients at your own risk." },
    ],
  },
  {
    title: "7. Acceptable Use",
    blocks: [
      { type: "text", text: "You agree not to:" },
      {
        type: "list",
        items: [
          "Abuse the infrastructure",
          "Reverse engineer protected systems",
          "Interfere with service availability",
          "Upload malware or harmful content",
          "Use the platform for unlawful purposes",
          "Attempt to bypass security or rate limits",
        ],
      },
      {
        type: "text",
        text: "We may limit or suspend access to protect the platform and users.",
      },
    ],
  },
  {
    title: "8. Privacy and Storage",
    blocks: [
      { type: "text", text: "Rocksky may store:" },
      {
        type: "list",
        items: [
          "Uploaded media",
          "Listening history",
          "Account metadata",
          "Usage information required to operate the service",
        ],
      },
      {
        type: "text",
        text: "While Rocksky may use third-party infrastructure providers, users remain responsible for the content they upload. Data handling is described in these Terms; there is no separate privacy policy document.",
      },
    ],
  },
  {
    title: "9. Service Availability",
    blocks: [
      {
        type: "text",
        text: 'Rocksky is provided on an "as is" and "as available" basis. We do not guarantee:',
      },
      {
        type: "list",
        items: [
          "Uninterrupted availability",
          "Permanent storage",
          "Error-free operation",
          "Compatibility with all clients or devices",
        ],
      },
      {
        type: "text",
        text: "Features may be modified, suspended, or removed at any time.",
      },
    ],
  },
  {
    title: "10. Limitation of Liability",
    blocks: [
      {
        type: "text",
        text: "To the maximum extent permitted by law, Rocksky and its operators shall not be liable for:",
      },
      {
        type: "list",
        items: [
          "Data loss",
          "Service interruptions",
          "Indirect damages or loss of profits",
          "Third-party actions",
          "Uploaded user content",
        ],
      },
      {
        type: "text",
        text: "Users are responsible for maintaining backups of important data and media.",
      },
    ],
  },
  {
    title: "11. Termination",
    blocks: [
      {
        type: "text",
        text: "We may suspend or terminate access to Rocksky if:",
      },
      {
        type: "list",
        items: [
          "These Terms are violated",
          "The platform is abused",
          "Required by law",
          "Necessary for platform security or stability",
        ],
      },
      { type: "text", text: "Users may stop using the service at any time." },
    ],
  },
  {
    title: "12. Changes to These Terms",
    blocks: [
      {
        type: "text",
        text: "These Terms may be updated periodically. Continued use of Rocksky after changes become effective constitutes acceptance of the updated Terms.",
      },
    ],
  },
  {
    title: "13. Contact",
    blocks: [
      {
        type: "contact",
        text: "For legal, copyright, or support inquiries, contact:",
        email: "support@rocksky.app",
      },
    ],
  },
];
