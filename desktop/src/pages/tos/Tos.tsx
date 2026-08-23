import Main from "../../layouts/Main";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[32px]">
      <h2 className="text-[var(--color-text)] text-[18px] font-semibold mb-[12px]">
        {title}
      </h2>
      <div className="text-[var(--color-text-secondary)] text-[14px] leading-relaxed space-y-[8px]">
        {children}
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-[20px] space-y-[4px]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Tos() {
  return (
    <Main>
      <div className="mt-[60px] mb-[200px] max-w-[720px]">
        <h1 className="text-[var(--color-text)] text-[28px] font-bold mb-[8px]">
          Terms of Service
        </h1>
        <p className="text-[var(--color-text-secondary)] text-[13px] mb-[40px]">
          Last updated: May 28, 2026
        </p>

        <p className="text-[var(--color-text-secondary)] text-[14px] leading-relaxed mb-[32px]">
          Welcome to Rocksky. By accessing or using Rocksky, you agree to these
          Terms of Service ("Terms"). If you do not agree to these Terms, please
          do not use the service.
        </p>

        <Section title="1. About Rocksky">
          <p>
            Rocksky is a music tracking, discovery, and personal media platform
            built on the AT Protocol. Features may include:
          </p>
          <BulletList
            items={[
              "Music scrobbling and listening history",
              "Personal music uploads",
              "Streaming through compatible clients",
              "Social and discovery features",
              "APIs and developer tools",
            ]}
          />
          <p>
            Rocksky may evolve over time and features may change without notice.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be legally allowed to use the service in your jurisdiction.
            You are responsible for complying with local laws and regulations
            when using Rocksky.
          </p>
        </Section>

        <Section title="3. User Accounts">
          <p>You are responsible for:</p>
          <BulletList
            items={[
              "Maintaining the security of your account",
              "Keeping your credentials secure",
              "Activities performed through your account",
            ]}
          />
          <p>You must not:</p>
          <BulletList
            items={[
              "Impersonate others",
              "Attempt unauthorized access",
              "Abuse or disrupt the platform",
            ]}
          />
          <p>
            We may suspend or terminate accounts that violate these Terms.
          </p>
        </Section>

        <Section title="4. Personal Music Uploads">
          <p>
            Rocksky may allow users to upload audio files for personal streaming
            and playback.
          </p>
          <p>You may only upload content that you own, or that you have the legal right or permission to use.</p>
          <p>You must not upload:</p>
          <BulletList
            items={[
              "Copyrighted material without authorization",
              "Pirated content",
              "Malicious files",
              "Illegal content",
            ]}
          />
          <p>
            Uploaded music libraries are private to the account owner unless
            explicitly stated otherwise by the platform. Rocksky does not claim
            ownership of your uploaded content.
          </p>
        </Section>

        <Section title="5. Copyright Policy">
          <p>
            Rocksky respects intellectual property rights. If you believe
            content hosted through Rocksky infringes your copyright, you may
            submit a takedown request containing:
          </p>
          <BulletList
            items={[
              "Identification of the copyrighted work",
              "Identification of the allegedly infringing material",
              "Your contact information",
              "A statement that you believe the use is unauthorized",
            ]}
          />
          <p>Rocksky reserves the right to remove content, restrict access, and suspend repeat infringers.</p>
        </Section>

        <Section title="6. APIs and Third-Party Clients">
          <p>
            Rocksky may provide compatibility with third-party applications and
            APIs, including Subsonic/Navidrome-compatible clients. Rocksky is
            not responsible for:
          </p>
          <BulletList
            items={[
              "Third-party applications or integrations",
              "External software behavior",
              "Data loss caused by third-party tools",
            ]}
          />
          <p>Use third-party clients at your own risk.</p>
        </Section>

        <Section title="7. Acceptable Use">
          <p>You agree not to:</p>
          <BulletList
            items={[
              "Abuse the infrastructure",
              "Reverse engineer protected systems",
              "Interfere with service availability",
              "Upload malware or harmful content",
              "Use the platform for unlawful purposes",
              "Attempt to bypass security or rate limits",
            ]}
          />
          <p>
            We may limit or suspend access to protect the platform and users.
          </p>
        </Section>

        <Section title="8. Privacy and Storage">
          <p>Rocksky may store:</p>
          <BulletList
            items={[
              "Uploaded media",
              "Listening history",
              "Account metadata",
              "Usage information required to operate the service",
            ]}
          />
          <p>
            While Rocksky may use third-party infrastructure providers, users
            remain responsible for the content they upload. Please refer to the
            Privacy Policy for more information.
          </p>
        </Section>

        <Section title="9. Service Availability">
          <p>
            Rocksky is provided on an "as is" and "as available" basis. We do
            not guarantee:
          </p>
          <BulletList
            items={[
              "Uninterrupted availability",
              "Permanent storage",
              "Error-free operation",
              "Compatibility with all clients or devices",
            ]}
          />
          <p>
            Features may be modified, suspended, or removed at any time.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, Rocksky and its operators
            shall not be liable for:
          </p>
          <BulletList
            items={[
              "Data loss",
              "Service interruptions",
              "Indirect damages or loss of profits",
              "Third-party actions",
              "Uploaded user content",
            ]}
          />
          <p>
            Users are responsible for maintaining backups of important data and
            media.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>We may suspend or terminate access to Rocksky if:</p>
          <BulletList
            items={[
              "These Terms are violated",
              "The platform is abused",
              "Required by law",
              "Necessary for platform security or stability",
            ]}
          />
          <p>Users may stop using the service at any time.</p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p>
            These Terms may be updated periodically. Continued use of Rocksky
            after changes become effective constitutes acceptance of the updated
            Terms.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            For legal, copyright, or support inquiries, contact:{" "}
            <a
              href="mailto:support@rocksky.app"
              className="text-[var(--color-purple)] hover:underline"
            >
              support@rocksky.app
            </a>
          </p>
        </Section>
      </div>
    </Main>
  );
}

export default Tos;
