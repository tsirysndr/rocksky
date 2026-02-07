import styled from "@emotion/styled";

const Link = styled.a`
  text-decoration: none;
  cursor: pointer;
  display: block;
  font-size: 13px;

  &:hover {
    text-decoration: underline;
  }
`;

function Links() {
  return (
    <div className="inline-flex mt-[40px]">
      <Link
        href="https://docs.rocksky.app/introduction-918639m0"
        target="_blank"
        className="mr-[10px] text-[var(--color-primary)]"
      >
        About
      </Link>
      <Link
        href="https://docs.rocksky.app/faq-918661m0"
        target="_blank"
        className="mr-[10px] text-[var(--color-primary)]"
      >
        FAQ
      </Link>
      <Link
        href="https://doc.rocksky.app/"
        target="_blank"
        className="mr-[10px] text-[var(--color-primary)]"
      >
        API Docs
      </Link>
      <Link
        href="https://docs.rocksky.app/overview-957781m0"
        target="_blank"
        className="mr-[10px] text-[var(--color-primary)]"
      >
        CLI
      </Link>
      <Link
        href="https://tangled.org/@rocksky.app/rocksky"
        target="_blank"
        className="mr-[10px] text-[var(--color-primary)]"
      >
        Source
      </Link>
      <Link
        href="https://discord.gg/EVcBy2fVa3"
        target="_blank"
        className="mr-[10px] text-[var(--color-primary)]"
      >
        Discord
      </Link>
    </div>
  );
}

export default Links;
