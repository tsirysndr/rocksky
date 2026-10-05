import {
  TOS_INTRO,
  TOS_LAST_UPDATED,
  TOS_SECTIONS,
  type TosBlock,
} from "../../../../shared/tos";
import Main from "../../layouts/Main";

function Block({ block }: { block: TosBlock }) {
  if (block.type === "list") {
    return (
      <ul className="list-disc pl-5 space-y-1">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  if (block.type === "contact") {
    return (
      <p>
        {block.text}{" "}
        <a
          href={`mailto:${block.email}`}
          className="underline"
          style={{ color: "var(--color-purple)" }}
        >
          {block.email}
        </a>
      </p>
    );
  }

  return <p>{block.text}</p>;
}

export default function TosPage() {
  return (
    <Main>
      <div className="px-4 pt-6 pb-10">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-text)" }}
        >
          Terms of Service
        </h1>
        <p
          className="text-xs mb-6"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Last updated: {TOS_LAST_UPDATED}
        </p>

        <p
          className="text-sm leading-relaxed mb-8"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {TOS_INTRO}
        </p>

        {TOS_SECTIONS.map((section) => (
          <div key={section.title} className="mb-8">
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--color-text)" }}
            >
              {section.title}
            </h2>
            <div
              className="text-sm leading-relaxed space-y-2"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Main>
  );
}
