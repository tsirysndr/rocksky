import type {
  LegalBlock,
  LegalDocument,
} from "../../../../shared/legal";
import Main from "../../layouts/Main";

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "list") {
    return (
      <ul className="list-disc pl-[20px] space-y-[4px]">
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
          className="text-[var(--color-purple)] hover:underline"
        >
          {block.email}
        </a>
      </p>
    );
  }

  return <p>{block.text}</p>;
}

function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <Main>
      <div className="mt-[60px] mb-[200px] max-w-[720px]">
        <h1 className="text-[var(--color-text)] text-[28px] font-bold mb-[8px]">
          {document.title}
        </h1>
        <p className="text-[var(--color-text-secondary)] text-[13px] mb-[40px]">
          Last updated: {document.lastUpdated}
        </p>

        <p className="text-[var(--color-text-secondary)] text-[14px] leading-relaxed mb-[32px]">
          {document.intro}
        </p>

        {document.sections.map((section) => (
          <div key={section.title} className="mb-[32px]">
            <h2 className="text-[var(--color-text)] text-[18px] font-semibold mb-[12px]">
              {section.title}
            </h2>
            <div className="text-[var(--color-text-secondary)] text-[14px] leading-relaxed space-y-[8px]">
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

export default LegalDocumentView;
