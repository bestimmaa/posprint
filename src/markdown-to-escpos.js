"use strict";

const MarkdownIt = require("markdown-it");
const {
  concat,
  init,
  setInternationalCharset,
  setCodePage,
  align,
  bold,
  size,
  line,
  text,
  feed,
  cut,
  rasterImage,
  qrCode
} = require("./escpos-builder");
const { imageTokenToRaster } = require("./image-to-escpos");

function wrapText(text, width) {
  const value = String(text || "").trim();
  if (!value) {
    return [""];
  }

  const safeWidth = Number.isInteger(width) && width > 0 ? width : 42;
  const words = value.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (word.length > safeWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }

      for (let offset = 0; offset < word.length; offset += safeWidth) {
        lines.push(word.slice(offset, offset + safeWidth));
      }
      continue;
    }

    if (!current) {
      current = word;
      continue;
    }

    if (current.length + 1 + word.length <= safeWidth) {
      current += ` ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

function renderWrappedPlainText(text, charsPerLine) {
  const lines = wrapText(text, charsPerLine);
  return lines.map((value) => line(value));
}

function renderLink(label, href) {
  const cleanLabel = String(label || "").trim();
  const cleanHref = String(href || "").trim();
  if (!cleanHref) {
    return cleanLabel;
  }
  if (!cleanLabel) {
    return cleanHref;
  }
  if (cleanLabel === cleanHref) {
    return cleanLabel;
  }
  return `${cleanLabel} (${cleanHref})`;
}

function parseQrShortcode(raw) {
  const full = String(raw || "");
  const inner = full.slice(2, -2);

  if (!inner.startsWith("qr:")) {
    throw new Error("missing qr: prefix");
  }

  const body = inner.slice(3);
  const parts = body.split("|");
  const payload = String(parts.shift() || "").trim();

  if (!payload) {
    throw new Error("payload is required");
  }

  const options = { size: 6, ec: "M" };

  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) {
      throw new Error(`invalid option: ${part}`);
    }

    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();

    if (key === "size") {
      const size = Number(value);
      if (!Number.isInteger(size) || size < 1 || size > 16) {
        throw new Error("size must be an integer between 1 and 16");
      }
      options.size = size;
      continue;
    }

    if (key === "ec") {
      const ec = value.toUpperCase();
      if (!["L", "M", "Q", "H"].includes(ec)) {
        throw new Error("ec must be one of L, M, Q, H");
      }
      options.ec = ec;
      continue;
    }

    throw new Error(`unknown option: ${part}`);
  }

  return { payload, size: options.size, ec: options.ec };
}

function scanTextForQrShortcodes(value) {
  const textValue = String(value || "");
  const out = [];
  let cursor = 0;

  while (cursor < textValue.length) {
    const start = textValue.indexOf("{{qr:", cursor);

    if (start === -1) {
      out.push({ type: "text", value: textValue.slice(cursor) });
      break;
    }

    if (start > cursor) {
      out.push({ type: "text", value: textValue.slice(cursor, start) });
    }

    const end = textValue.indexOf("}}", start + 5);
    if (end === -1) {
      out.push({ type: "text", value: textValue.slice(start) });
      break;
    }

    out.push({ type: "qr", raw: textValue.slice(start, end + 2) });
    cursor = end + 2;
  }

  return out;
}

function collectInlineRange(children, startIndex, openType, closeType) {
  let depth = 1;
  let end = startIndex + 1;

  while (end < children.length && depth > 0) {
    if (children[end].type === openType) {
      depth += 1;
    } else if (children[end].type === closeType) {
      depth -= 1;
    }

    if (depth > 0) {
      end += 1;
    }
  }

  return {
    inner: children.slice(startIndex + 1, end),
    endIndex: end
  };
}

function normalizeSegments(segments) {
  const out = [];

  for (const segment of segments) {
    if (!segment || !segment.text) {
      continue;
    }

    const value = String(segment.text);
    if (!value) {
      continue;
    }

    const boldEnabled = Boolean(segment.bold);
    const prev = out[out.length - 1];

    if (prev && prev.bold === boldEnabled) {
      prev.text += value;
      continue;
    }

    out.push({ text: value, bold: boldEnabled });
  }

  return out;
}

function segmentsToText(segments) {
  return normalizeSegments(segments)
    .map((segment) => segment.text)
    .join("");
}

function inlineToSegments(children, strictMarkdown = false, boldEnabled = false) {
  if (!Array.isArray(children) || !children.length) {
    return [];
  }

  const out = [];

  for (let i = 0; i < children.length; i += 1) {
    const token = children[i];

    if (token.type === "text" || token.type === "code_inline") {
      out.push({ text: token.content, bold: boldEnabled });
      continue;
    }

    if (token.type === "html_inline") {
      if (strictMarkdown) {
        throw new Error(`Unsupported markdown construct: ${token.type}`);
      }
      out.push({ text: token.content, bold: boldEnabled });
      continue;
    }

    if (token.type === "softbreak" || token.type === "hardbreak") {
      out.push({ text: "\n", bold: boldEnabled });
      continue;
    }

    if (token.type === "strong_open") {
      const range = collectInlineRange(children, i, "strong_open", "strong_close");
      out.push(...inlineToSegments(range.inner, strictMarkdown, true));
      i = range.endIndex;
      continue;
    }

    if (token.type === "em_open") {
      const range = collectInlineRange(children, i, "em_open", "em_close");
      out.push(...inlineToSegments(range.inner, strictMarkdown, boldEnabled));
      i = range.endIndex;
      continue;
    }

    if (token.type === "s_open") {
      const range = collectInlineRange(children, i, "s_open", "s_close");
      out.push(...inlineToSegments(range.inner, strictMarkdown, boldEnabled));
      i = range.endIndex;
      continue;
    }

    if (token.type === "link_open") {
      const range = collectInlineRange(children, i, "link_open", "link_close");
      const label = segmentsToText(inlineToSegments(range.inner, strictMarkdown, false));
      out.push({ text: renderLink(label, token.attrGet("href")), bold: boldEnabled });
      i = range.endIndex;
    }
  }

  return normalizeSegments(out);
}

function inlineToText(children, strictMarkdown = false) {
  return segmentsToText(inlineToSegments(children, strictMarkdown));
}

function splitSegmentsByBreaks(segments) {
  const rows = [[]];

  for (const segment of normalizeSegments(segments)) {
    const parts = segment.text.split("\n");

    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i]) {
        rows[rows.length - 1].push({ text: parts[i], bold: segment.bold });
      }

      if (i < parts.length - 1) {
        rows.push([]);
      }
    }
  }

  return rows.map((row) => normalizeSegments(row));
}

function splitSegmentsByWidth(segments, width) {
  const safeWidth = Number.isInteger(width) && width > 0 ? width : 42;
  const lines = [];
  let current = [];
  let currentWidth = 0;
  let pendingSpaces = [];
  let pendingSpaceWidth = 0;

  function appendSegment(target, value, enabledBold) {
    if (!value) {
      return;
    }

    const boldValue = Boolean(enabledBold);
    const prev = target[target.length - 1];
    if (prev && prev.bold === boldValue) {
      prev.text += value;
      return;
    }

    target.push({ text: value, bold: boldValue });
  }

  function pushPendingSpaces() {
    for (const part of pendingSpaces) {
      appendSegment(current, part.text, part.bold);
    }
    currentWidth += pendingSpaceWidth;
    pendingSpaces = [];
    pendingSpaceWidth = 0;
  }

  function pushCurrent() {
    lines.push(normalizeSegments(current));
    current = [];
    currentWidth = 0;
    pendingSpaces = [];
    pendingSpaceWidth = 0;
  }

  function appendTokenWithWrapping(token) {
    for (const part of token.parts) {
      let start = 0;

      while (start < part.text.length) {
        if (currentWidth === safeWidth) {
          pushCurrent();
        }

        const room = safeWidth - currentWidth;
        const take = Math.min(room, part.text.length - start);
        appendSegment(current, part.text.slice(start, start + take), part.bold);
        currentWidth += take;
        start += take;
      }
    }
  }

  const tokens = [];

  for (const segment of normalizeSegments(segments)) {
    for (const ch of segment.text) {
      const isSpace = /\s/.test(ch);
      const prevToken = tokens[tokens.length - 1];

      if (!prevToken || prevToken.isSpace !== isSpace) {
        tokens.push({ isSpace, length: 0, parts: [] });
      }

      const token = tokens[tokens.length - 1];
      const prevPart = token.parts[token.parts.length - 1];
      if (prevPart && prevPart.bold === Boolean(segment.bold)) {
        prevPart.text += ch;
      } else {
        token.parts.push({ text: ch, bold: Boolean(segment.bold) });
      }
      token.length += 1;
    }
  }

  for (const token of tokens) {
    if (token.isSpace) {
      if (currentWidth === 0) {
        if (lines.length === 0 && current.length === 0) {
          appendTokenWithWrapping(token);
        }
        continue;
      }
      pendingSpaces = normalizeSegments([...pendingSpaces, ...token.parts]);
      pendingSpaceWidth += token.length;
      continue;
    }

    if (currentWidth > 0 && currentWidth + pendingSpaceWidth + token.length <= safeWidth) {
      pushPendingSpaces();
      appendTokenWithWrapping(token);
      continue;
    }

    if (currentWidth > 0 && currentWidth + pendingSpaceWidth + token.length > safeWidth) {
      pushCurrent();
    }

    appendTokenWithWrapping(token);
    pendingSpaces = [];
    pendingSpaceWidth = 0;
  }

  if (pendingSpaceWidth > 0 && currentWidth > 0 && currentWidth + pendingSpaceWidth <= safeWidth) {
    pushPendingSpaces();
  }

  if (pendingSpaceWidth > 0 && currentWidth > 0 && currentWidth + pendingSpaceWidth > safeWidth) {
    pushCurrent();
  }

  if (current.length || lines.length === 0) {
    lines.push(normalizeSegments(current));
  }

  return lines;
}

function renderStyledLine(lineSegments, chunks, prefix = "") {
  const parts = [];
  let activeBold = false;

  if (prefix) {
    parts.push(text(prefix));
  }

  for (const segment of normalizeSegments(lineSegments)) {
    const segmentBold = Boolean(segment.bold);
    if (segmentBold !== activeBold) {
      parts.push(bold(segmentBold));
      activeBold = segmentBold;
    }

    parts.push(text(segment.text));
  }

  if (activeBold) {
    parts.push(bold(false));
  }

  parts.push(text("\n"));
  chunks.push(concat(parts));
}

function renderWrappedSegments(segments, chunks, charsPerLine, prefix = "") {
  const safePrefix = String(prefix || "");
  const rowWidth = Math.max(1, charsPerLine - safePrefix.length);
  const rows = splitSegmentsByBreaks(segments);

  for (const row of rows) {
    const wrapped = splitSegmentsByWidth(row, rowWidth);

    for (const wrappedLine of wrapped) {
      renderStyledLine(wrappedLine, chunks, safePrefix);
    }
  }
}

function renderHeading(level, text, chunks, charsPerLine) {
  if (level === 1) {
    chunks.push(align("center"), bold(true), size(1, 1));
  } else if (level === 2) {
    chunks.push(align("center"), bold(true), size(1, 0));
  } else {
    chunks.push(align("left"), bold(true), size(0, 0));
  }

  for (const wrapped of wrapText(text, charsPerLine)) {
    chunks.push(line(wrapped));
  }

  chunks.push(size(0, 0), bold(false), align("left"), line(""));
}

function renderParagraph(text, chunks, charsPerLine) {
  const rows = String(text || "").split(/\r?\n/);
  for (const row of rows) {
    chunks.push(...renderWrappedPlainText(row, charsPerLine));
  }
  chunks.push(line(""));
}

function renderParagraphInline(children, chunks, charsPerLine, strictMarkdown, prefix = "") {
  const segments = inlineToSegments(children, strictMarkdown);
  renderWrappedSegments(segments, chunks, charsPerLine, prefix);
  chunks.push(line(""));
}

function renderInlineChildrenWithImages(children, chunks, charsPerLine, strictMarkdown, prefix = "") {
  const buffered = [];
  const inlineChildren = Array.isArray(children) ? children : [];

  function flushBuffered() {
    if (!buffered.length) {
      return;
    }
    const segments = inlineToSegments(buffered, strictMarkdown);
    renderWrappedSegments(segments, chunks, charsPerLine, prefix);
    buffered.length = 0;
  }

  function consumeSpanningQrShortcode(startIndex) {
    const token = inlineChildren[startIndex];
    if (!token || (token.type !== "text" && token.type !== "code_inline")) {
      return null;
    }

    const value = String(token.content || "");
    const start = value.indexOf("{{qr:");
    if (start === -1) {
      return null;
    }

    if (value.indexOf("}}", start + 5) !== -1) {
      return { content: value, endIndex: startIndex };
    }

    let combined = value;

    for (let index = startIndex + 1; index < inlineChildren.length; index += 1) {
      const next = inlineChildren[index];

      if (!next) {
        break;
      }

      if (next.type === "link_open" || next.type === "link_close") {
        if (combined.indexOf("}}", start + 5) !== -1) {
          return { content: combined, endIndex: index };
        }
        continue;
      }

      if (next.type !== "text" && next.type !== "code_inline") {
        break;
      }

      combined += String(next.content || "");

      if (combined.indexOf("}}", start + 5) !== -1) {
        return { content: combined, endIndex: index };
      }
    }

    return null;
  }

  for (let i = 0; i < inlineChildren.length; i += 1) {
    const token = inlineChildren[i];

    if (token.type === "image") {
      flushBuffered();

      const src = token.attrGet("src");
      const raster = imageTokenToRaster({ src, charsPerLine, threshold: 128 });

      chunks.push(align("center"));
      chunks.push(rasterImage(raster));
      chunks.push(text("\n"));
      chunks.push(align("left"));
      continue;
    }

    if (token.type === "text" || token.type === "code_inline") {
      const spanning = consumeSpanningQrShortcode(i);
      const source = spanning ? spanning.content : String(token.content || "");
      if (spanning) {
        i = spanning.endIndex;
      }

      const parts = scanTextForQrShortcodes(source);

      for (const part of parts) {
        if (part.type === "text") {
          if (part.value) {
            buffered.push({ ...token, type: "text", content: part.value });
          }
          continue;
        }

        flushBuffered();

        try {
          const parsed = parseQrShortcode(part.raw);
          chunks.push(align("center"));
          chunks.push(qrCode(parsed));
          chunks.push(text("\n"));
          chunks.push(align("left"));
        } catch (error) {
          const message = `Invalid QR shortcode "${part.raw}": ${error.message}`;
          if (strictMarkdown) {
            throw new Error(message);
          }
          console.warn(message);
          buffered.push({ ...token, type: "text", content: part.raw });
        }
      }
      continue;
    }

    buffered.push(token);
  }

  flushBuffered();
}

function childrenContainImage(children) {
  return Array.isArray(children) && children.some((token) => token.type === "image");
}

function childrenContainQrShortcode(children) {
  return Array.isArray(children) && children.some((token) => {
    if (token.type !== "text" && token.type !== "code_inline") {
      return false;
    }
    return String(token.content || "").includes("{{qr:");
  });
}

function normalizeTaskMarkersInSegments(segments) {
  return normalizeSegments(segments).map((segment) => ({
    text: segment.text.replace(/\[X\]/g, "[x]"),
    bold: segment.bold
  }));
}

function getListIndent(depth) {
  return "  ".repeat(Math.max(0, depth - 1));
}

function renderListItem(text, chunks, charsPerLine, marker) {
  const lines = wrapText(`${marker} ${String(text || "").trim()}`, charsPerLine);
  for (const value of lines) {
    chunks.push(line(value));
  }
}

function renderRule(chunks, charsPerLine) {
  chunks.push(line("-".repeat(Math.max(8, Math.min(charsPerLine, 42)))));
}

function renderCodeBlock(text, chunks, charsPerLine) {
  const rows = String(text || "").split(/\r?\n/);
  for (const row of rows) {
    chunks.push(...renderWrappedPlainText(row, charsPerLine));
  }
  chunks.push(line(""));
}

function markdownToEscpos(markdown, options = {}) {
  const charsPerLine = Number.isInteger(options.charsPerLine) ? options.charsPerLine : 42;
  const strictMarkdown = Boolean(options.strictMarkdown);
  const md = new MarkdownIt({ html: true, linkify: true, breaks: false });
  const tokens = md.parse(String(markdown || ""), {});
  const chunks = [init(), setInternationalCharset(0), setCodePage(0)];

  const listStack = [];
  const listItemStack = [];
  let listItemDepth = 0;
  let blockquoteDepth = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.type === "heading_open") {
      const level = Number(token.tag.slice(1));
      const inline = tokens[i + 1];
      const text = inline && inline.type === "inline" ? inlineToText(inline.children, strictMarkdown) : "";
      renderHeading(level, text, chunks, charsPerLine);
      i += 2;
      continue;
    }

    if (token.type === "paragraph_open") {
      const inline = tokens[i + 1];
      const children = inline && inline.type === "inline" ? inline.children : [];
      const quotePrefix = blockquoteDepth > 0 ? "| " : "";

      if (listItemDepth > 0) {
        const currentListItem = listItemStack[listItemStack.length - 1];
        const hasImage = childrenContainImage(children);
        const hasQrShortcode = childrenContainQrShortcode(children);

        if (hasImage || hasQrShortcode) {
          if (currentListItem && !currentListItem.hasRenderedContent) {
            const indent = getListIndent(listItemDepth);
            chunks.push(line(`${quotePrefix}${indent}${currentListItem.marker} `));
            currentListItem.hasRenderedContent = true;
          }

          renderInlineChildrenWithImages(children, chunks, charsPerLine, strictMarkdown, `${quotePrefix}${getListIndent(listItemDepth)}  `);
          chunks.push(line(""));
          i += 2;
          continue;
        }

        let segments = inlineToSegments(children, strictMarkdown);

        if (currentListItem && !currentListItem.hasRenderedContent) {
          const indent = getListIndent(listItemDepth);
          segments = normalizeTaskMarkersInSegments(segments);
          segments = [{ text: `${indent}${currentListItem.marker} `, bold: false }, ...segments];
          currentListItem.hasRenderedContent = true;
        }

        renderWrappedSegments(segments, chunks, charsPerLine, quotePrefix);
        chunks.push(line(""));
        i += 2;
        continue;
      }

      renderInlineChildrenWithImages(children, chunks, charsPerLine, strictMarkdown, quotePrefix);
      chunks.push(line(""));
      i += 2;
      continue;
    }

    if (token.type === "blockquote_open") {
      blockquoteDepth += 1;
      continue;
    }

    if (token.type === "blockquote_close") {
      blockquoteDepth = Math.max(0, blockquoteDepth - 1);
      continue;
    }

    if (token.type === "bullet_list_open") {
      if (listItemDepth > 0) {
        const currentListItem = listItemStack[listItemStack.length - 1];
        if (currentListItem && !currentListItem.hasRenderedContent) {
          const quotePrefix = blockquoteDepth > 0 ? "| " : "";
          const indent = getListIndent(listItemDepth);
          chunks.push(line(`${quotePrefix}${indent}${currentListItem.marker} `));
          currentListItem.hasRenderedContent = true;
        }
      }
      listStack.push({ ordered: false, index: 0 });
      continue;
    }

    if (token.type === "ordered_list_open") {
      if (listItemDepth > 0) {
        const currentListItem = listItemStack[listItemStack.length - 1];
        if (currentListItem && !currentListItem.hasRenderedContent) {
          const quotePrefix = blockquoteDepth > 0 ? "| " : "";
          const indent = getListIndent(listItemDepth);
          chunks.push(line(`${quotePrefix}${indent}${currentListItem.marker} `));
          currentListItem.hasRenderedContent = true;
        }
      }
      listStack.push({ ordered: true, index: Number(token.attrGet("start") || 1) });
      continue;
    }

    if (token.type === "bullet_list_close" || token.type === "ordered_list_close") {
      listStack.pop();
      chunks.push(line(""));
      continue;
    }

    if (token.type === "list_item_open") {
      listItemDepth += 1;
      const current = listStack[listStack.length - 1] || { ordered: false, index: 0 };
      const marker = current.ordered ? `${current.index}.` : "-";
      if (current.ordered) {
        current.index += 1;
      }

      listItemStack.push({ marker, hasRenderedContent: false });
      continue;
    }

    if (token.type === "list_item_close") {
      listItemDepth = Math.max(0, listItemDepth - 1);
      listItemStack.pop();
      continue;
    }

    if (token.type === "hr") {
      renderRule(chunks, charsPerLine);
      continue;
    }

    if (token.type === "fence" || token.type === "code_block") {
      renderCodeBlock(token.content, chunks, charsPerLine);
      continue;
    }

    if (token.type === "html_block" || token.type === "html_inline") {
      if (strictMarkdown) {
        throw new Error(`Unsupported markdown construct: ${token.type}`);
      }
      chunks.push(...renderWrappedPlainText(token.content, charsPerLine));
      continue;
    }
  }

  chunks.push(feed(4), cut(true));
  return concat(chunks);
}

module.exports = {
  markdownToEscpos,
  wrapText,
  renderHeading,
  renderParagraph,
  renderListItem,
  renderRule,
  renderCodeBlock,
  renderLink
};
