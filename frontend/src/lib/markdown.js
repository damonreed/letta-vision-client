/** HTML tags; do not treat as Letta pseudo-XML blocks. */
const HTML_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const PSEUDO_XML_BLOCK =
  /<([a-z][\w-]*)(\s[^>]*)?>\s*([\s\S]*?)\s*<\/\1>/gi;

/** Agent meta-commentary often placed inside a block before the closing tag. */
const TRAILING_COMMENTARY =
  /\n\n(?=(?:A few notes|Some notes|Notes on (?:the )?)[^\n]*(?:\n|$))/i;

function isPseudoXmlBlock(tag) {
  return !HTML_TAGS.has(String(tag).toLowerCase());
}

/** Strip opening fence left before a literal pseudo-XML block (e.g. ```xml). */
function stripOrphanFenceBeforeLiteral(text) {
  return text.replace(/\n?```[a-zA-Z]*\s*$/m, "");
}

/** Strip closing fence left after a literal pseudo-XML block. */
function stripOrphanFenceAfterLiteral(text) {
  return text.replace(/^\s*\n?```\s*\n?/, "");
}

function cleanMarkdownAroundLiteral(text, { beforeLiteral = false, afterLiteral = false } = {}) {
  let out = text;
  if (beforeLiteral) out = stripOrphanFenceBeforeLiteral(out);
  if (afterLiteral) out = stripOrphanFenceAfterLiteral(out);
  return out;
}

function peelTrailingCommentary(literalBlock) {
  const match = literalBlock.match(
    /^<([a-z][\w-]*)(\s[^>]*)?>\s*([\s\S]*?)\s*<\/\1>$/i,
  );
  if (!match) return { literal: literalBlock, tail: null };

  const [, tag, attrs, inner] = match;
  const splitAt = inner.search(TRAILING_COMMENTARY);
  if (splitAt < 0) return { literal: literalBlock, tail: null };

  const docInner = inner.slice(0, splitAt).replace(/\s+$/, "");
  const tail = inner.slice(splitAt).replace(/^\n+/, "");
  const open = `<${tag}${attrs || ""}>`;
  return {
    literal: `${open}\n${docInner}\n</${tag}>`,
    tail: tail || null,
  };
}

function findUnclosedPseudoXml(text, closedRanges) {
  const unclosed = [];
  const openRe = /<([a-z][\w-]*)(\s[^>]*)?>/gi;
  let match;

  while ((match = openRe.exec(text)) !== null) {
    const tag = match[1];
    if (!isPseudoXmlBlock(tag)) continue;

    const start = match.index;
    if (closedRanges.some((r) => start >= r.start && start < r.end)) continue;

    const openEnd = start + match[0].length;
    const afterOpen = text.slice(openEnd);
    // Require a line break after the opening tag (not inline mentions like "<file_system> block").
    if (!/^\s*\n/.test(afterOpen)) continue;

    const rest = afterOpen.replace(/^\s*\n?/, "");
    const closeRe = new RegExp(`</${tag}\\s*>`, "i");
    if (closeRe.test(rest)) continue;

    const splitAt = rest.search(TRAILING_COMMENTARY);
    const contentEnd = splitAt >= 0 ? splitAt : rest.length;
    const inner = rest.slice(0, contentEnd).replace(/\s+$/, "");
    const open = `<${tag}${match[2] || ""}>`;
    const literal = inner ? `${open}\n${inner}` : open;
    const tail =
      splitAt >= 0 ? rest.slice(splitAt).replace(/^\n+/, "") || null : null;

    unclosed.push({
      start,
      end: openEnd + afterOpen.length,
      literal,
      tail,
    });
  }

  return unclosed;
}

/**
 * Split agent text into markdown prose and literal pseudo-XML blocks
 * (e.g. <code_execution>...</code_execution>) for separate rendering.
 */
export function splitAgentContent(text) {
  if (!text) return [{ type: "markdown", text: "" }];

  const literals = [];
  const re = new RegExp(PSEUDO_XML_BLOCK.source, "gi");
  let match;
  while ((match = re.exec(text)) !== null) {
    if (isPseudoXmlBlock(match[1])) {
      literals.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });
    }
  }

  const closedRanges = literals.map((lit) => ({ start: lit.start, end: lit.end }));
  for (const block of findUnclosedPseudoXml(text, closedRanges)) {
    literals.push({
      start: block.start,
      end: block.end,
      text: block.literal,
      tail: block.tail,
    });
  }

  if (!literals.length) return [{ type: "markdown", text }];

  literals.sort((a, b) => a.start - b.start);

  const segments = [];
  let lastIndex = 0;
  for (const lit of literals) {
    if (lit.start > lastIndex) {
      segments.push({
        type: "markdown",
        text: cleanMarkdownAroundLiteral(text.slice(lastIndex, lit.start), {
          beforeLiteral: true,
        }),
      });
    }
    const peeled = lit.tail
      ? { literal: lit.text, tail: lit.tail }
      : peelTrailingCommentary(lit.text);
    segments.push({ type: "literal", text: peeled.literal });
    if (peeled.tail) {
      segments.push({
        type: "markdown",
        text: cleanMarkdownAroundLiteral(peeled.tail, { afterLiteral: true }),
      });
    }
    lastIndex = lit.end;
  }
  if (lastIndex < text.length) {
    segments.push({
      type: "markdown",
      text: cleanMarkdownAroundLiteral(text.slice(lastIndex), { afterLiteral: true }),
    });
  }
  return segments.filter((seg) => seg.type === "literal" || seg.text.trim());
}
