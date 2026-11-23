import { useEffect, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Check, Code2, Copy } from "lucide-react";
import sdkTokens from "./sdk-tokens.json";
import { sdkExamples, type SdkExample } from "./sdk-examples";

function ExamplePanel({ example }: { example: SdkExample }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(example.code);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div
      className="sdk-example-panel"
      role="tabpanel"
      id={`sdk-panel-${example.id}`}
      aria-labelledby={`sdk-tab-${example.id}`}
      tabIndex={0}
    >
      <div className="sdk-example-story">
        <span className="integration-kicker">MAKE IT YOURS</span>
        <h3>{example.title}</h3>
        <p>{example.description}</p>
        <div className="sdk-example-setup">
          <span>GET STARTED</span>
          <pre>
            <code>{example.setup}</code>
          </pre>
          {example.note && <p>{example.note}</p>}
        </div>
        <a
          href={`https://github.com/tsirysndr/rocksky/tree/main/sdk/${example.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
        >
          Explore the {example.language} SDK <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="sdk-example-editor">
        <div className="sdk-example-toolbar">
          <span>
            <Code2 size={15} aria-hidden="true" /> {example.file}
          </span>
          <button
            type="button"
            onClick={() => void copyCode()}
            aria-label={`Copy ${example.language} example`}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
        <pre
          className="sdk-example-code"
          tabIndex={0}
          aria-label={`${example.language} code example`}
        >
          <code>
            {sdkTokens[example.id as keyof typeof sdkTokens].map(
              (line, index) => (
                <span className="sdk-code-line" key={index}>
                  <span className="sdk-line-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  {line.map((token, tokenIndex) => (
                    <span key={tokenIndex} style={{ color: token.color }}>
                      {token.content}
                    </span>
                  ))}
                </span>
              ),
            )}
          </code>
        </pre>
        <p className={copyError ? "sdk-copy-error" : "sr-only"} role="status">
          {copyError
            ? "Couldn’t copy. Select the code and copy it manually."
            : copied
              ? "Example copied to clipboard."
              : ""}
        </p>
      </div>
    </div>
  );
}

export default function SdkIntegrations() {
  const [selected, setSelected] = useState(0);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % sdkExamples.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + sdkExamples.length) % sdkExamples.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = sdkExamples.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setSelected(next);
    document.getElementById(`sdk-tab-${sdkExamples[next].id}`)?.focus();
  }
  return (
    <section
      id="integrations"
      className="container sdk-section section-space"
      aria-labelledby="sdk-section-title"
    >
      <div className="section-heading">
        <div>
          <div className="eyebrow">07 / BUILD WITH ROCKSKY</div>
          <h2 id="sdk-section-title">
            Your next idea.
            <br />
            <span className="muted-heading">A few lines away.</span>
          </h2>
        </div>
        <p className="sdk-section-intro">
          Build discovery tools, connect a player, or turn listening history
          into something personal. Pick your language and make it happen.
        </p>
      </div>
      <div className="sdk-playground">
        <div
          className="sdk-language-tabs"
          role="tablist"
          aria-label="SDK language"
        >
          {sdkExamples.map((item, index) => (
            <button
              type="button"
              role="tab"
              id={`sdk-tab-${item.id}`}
              aria-selected={selected === index}
              aria-controls={`sdk-panel-${item.id}`}
              tabIndex={selected === index ? 0 : -1}
              key={item.id}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => navigate(event, index)}
            >
              {item.language}
            </button>
          ))}
        </div>
        {sdkExamples.map((item, index) =>
          selected === index ? (
            <ExamplePanel key={item.id} example={item} />
          ) : (
            <div
              key={item.id}
              id={`sdk-panel-${item.id}`}
              role="tabpanel"
              aria-labelledby={`sdk-tab-${item.id}`}
              hidden
            />
          ),
        )}
      </div>
      <div className="sdk-section-footer">
        <span>Real SDK calls. Useful little starting points.</span>
        <a
          href="https://docs.rocksky.app/sdks/overview"
          target="_blank"
          rel="noopener noreferrer"
        >
          Browse all SDKs <ArrowUpRight size={16} />
        </a>
      </div>
    </section>
  );
}
