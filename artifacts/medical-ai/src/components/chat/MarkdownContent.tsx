type InlineNode =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const candidates: { index: number; match: RegExpMatchArray; type: InlineNode["type"] }[] = [];
    if (boldMatch && boldMatch.index !== undefined) candidates.push({ index: boldMatch.index, match: boldMatch, type: "bold" });
    if (italicMatch && italicMatch.index !== undefined) candidates.push({ index: italicMatch.index, match: italicMatch, type: "italic" });
    if (codeMatch && codeMatch.index !== undefined) candidates.push({ index: codeMatch.index, match: codeMatch, type: "code" });
    if (candidates.length === 0) { nodes.push({ type: "text", value: remaining }); break; }
    candidates.sort((a, b) => a.index - b.index);
    const first = candidates[0];
    if (first.index > 0) nodes.push({ type: "text", value: remaining.slice(0, first.index) });
    nodes.push({ type: first.type, value: first.match[1] });
    remaining = remaining.slice(first.index + first.match[0].length);
  }
  return nodes;
}

function renderInline(text: string, key: string) {
  const nodes = parseInline(text);
  return (
    <span key={key}>
      {nodes.map((node, i) => {
        if (node.type === "bold") return <strong key={i} className="font-semibold text-foreground">{node.value}</strong>;
        if (node.type === "italic") return <em key={i} className="italic">{node.value}</em>;
        if (node.type === "code") return <code key={i} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono">{node.value}</code>;
        return <span key={i}>{node.value}</span>;
      })}
    </span>
  );
}

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "bullet"; items: string[] }
  | { type: "ordered"; items: string[] }
  | { type: "codeblock"; code: string; lang?: string }
  | { type: "blockquote"; text: string }
  | { type: "divider" };

function parseBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "codeblock", code: codeLines.join("\n"), lang: lang || undefined });
      i++;
      continue;
    }

    if (line.startsWith("---") || line.startsWith("***")) {
      blocks.push({ type: "divider" });
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "heading", text: line.slice(4), level: 3 });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "heading", text: line.slice(3), level: 2 });
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ type: "heading", text: line.slice(2), level: 1 });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push({ type: "blockquote", text: line.slice(2) });
      i++;
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "bullet", items });
      continue;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (orderedMatch) {
      const items: string[] = [orderedMatch[2]];
      i++;
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ordered", items });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
    i++;
  }

  return blocks;
}

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed">
      {blocks.map((block, idx) => {
        const key = `block-${idx}`;
        switch (block.type) {
          case "heading": {
            const cls =
              block.level === 1
                ? "text-base font-bold text-foreground mt-1"
                : block.level === 2
                  ? "text-sm font-semibold text-foreground mt-1"
                  : "text-sm font-semibold text-foreground/90 mt-0.5";
            return <p key={key} className={cls}>{renderInline(block.text, key)}</p>;
          }
          case "paragraph":
            return <p key={key} className="text-muted-foreground">{renderInline(block.text, key)}</p>;
          case "bullet":
            return (
              <ul key={key} className="space-y-1.5 pl-1">
                {block.items.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                    <span>{renderInline(item, `${key}-${ii}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ordered":
            return (
              <ol key={key} className="space-y-1.5 pl-1">
                {block.items.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-2.5 text-muted-foreground">
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                      {ii + 1}
                    </span>
                    <span className="flex-1">{renderInline(item, `${key}-${ii}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case "codeblock":
            return (
              <pre key={key} className="bg-background/80 border border-white/8 rounded-xl p-4 overflow-x-auto">
                <code className="text-xs font-mono text-cyan-300/90 leading-relaxed whitespace-pre-wrap">{block.code}</code>
              </pre>
            );
          case "blockquote":
            return (
              <blockquote key={key} className="border-l-2 border-primary/40 pl-3 text-muted-foreground/80 italic text-xs">
                {renderInline(block.text, key)}
              </blockquote>
            );
          case "divider":
            return <hr key={key} className="border-white/8 my-1" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
