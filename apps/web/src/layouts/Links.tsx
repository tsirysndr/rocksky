import styled from "@emotion/styled";
import { Link as RouterLink } from "@tanstack/react-router";

const Link = styled.a`
  text-decoration: none;
  cursor: pointer;
  display: block;
  font-size: 13px;

  &:hover {
    text-decoration: underline;
  }
`;

const InternalLink = styled(RouterLink)`
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
    <div className="inline-flex mt-[30px] mb-[20px]">
      <Link
        href="https://docs.rocksky.app"
        target="_blank"
        className="mr-[10px] text-[var(--color-primary)]"
      >
        About
      </Link>
      <Link
        href="https://docs.rocksky.app/faq"
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
        Docs
      </Link>
      <Link
        href="https://docs.rocksky.app/cli/overview"
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
      <InternalLink to="/tos" className="mr-[10px] text-[var(--color-primary)]">
        Terms
      </InternalLink>
    </div>
  );
}

export default Links;
