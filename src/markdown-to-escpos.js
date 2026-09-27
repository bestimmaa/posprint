"use strict";

const MarkdownIt = require("markdown-it");
const {
  concat,
  init,
  setInternationalCharset,
  setCodePage,
  align,
  bold,
  italic,
  size,
  line,
  feed,
  cut,
  rasterImage,
  qrCode,
  font,
  characterSpacing,
  lineSpacing,
  leftMargin,
  printAreaWidth
} = require("./escpos-builder");
const { imageTokenToRaster } = require("./image-to-escpos");
const { encodeText, encodeTextDetailed, resolveCodePage } = require("./text-transcoder");

const LINE_FEED = Uint8Array.from([0x0a]);

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

function encodeEscposTextDetailed(value, codePageName) {
  return encodeTextDetailed(value, { codePage: codePageName });
}

function encodeEscposText(value, codePageName, replacements = null) {
  if (!Array.isArray(replacements)) {
    return encodeText(value, { codePage: codePageName });
  }

  const encoded = encodeEscposTextDetailed(value, codePageName);
  replacements.push(...encoded.replacements);
  return encoded.bytes;
}

function encodedLine(value, codePageName, replacements = null) {
  return concat([encodeEscposText(value, codePageName, replacements), LINE_FEED]);
}

function renderWrappedPlainText(text, charsPerLine, codePageName, replacements = null) {
  const lines = wrapText(text, charsPerLine);
  return lines.map((value) => encodedLine(value, codePageName, replacements));
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

function scanTextForShortcodes(value) {
  const textValue = String(value || "");
  const opener = /\{\{(qr|row):/g;
  const out = [];
  let cursor = 0;

  while (cursor < textValue.length) {
    opener.lastIndex = cursor;
    const match = opener.exec(textValue);

    if (!match) {
      out.push({ type: "text", value: textValue.slice(cursor) });
      break;
    }

    const start = match.index;
    if (start > cursor) {
      out.push({ type: "text", value: textValue.slice(cursor, start) });
    }

    const end = textValue.indexOf("}}", start + 5);
    if (end === -1) {
      out.push({ type: "text", value: textValue.slice(start) });
      break;
    }

    out.push({ type: match[1], raw: textValue.slice(start, end + 2) });
    cursor = end + 2;
  }

  return out;
}

function textWidth(value) {
  return Array.from(String(value || "")).length;
}

function parseRowShortcode(raw) {
  const parts = String(raw || "").slice(6, -2).split("|");

  if (parts.length < 2) {
    throw new Error("expected {{row:<left>|<right>}}");
  }

  const [left, right] = parts.splice(0, 2).map((part) => part.replace(/\s+/g, " ").trim());

  if (!left && !right) {
    throw new Error("left or right text is required");
  }

  let fill = " ";

  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0 || part.slice(0, idx).trim() !== "fill") {
      throw new Error(`unknown option: ${part}`);
    }

    const value = part.slice(idx + 1);
    fill = textWidth(value) === 1 ? value : value.trim();
    if (textWidth(fill) !== 1) {
      throw new Error("fill must be exactly one character");
    }
  }

  return { left, right, fill };
}

function layoutRow({ left, right, fill }, width) {
  const rightWidth = textWidth(right);

  if (rightWidth >= width) {
    // Right text cannot share a line with a fill char: wrap it onto right-aligned lines of its own.
    const rightLines = wrapText(right, width).map((value) => `${fill.repeat(width - textWidth(value))}${value}`);
    return left ? [...wrapText(left, width), ...rightLines] : rightLines;
  }

  // Keep as many trailing words of the wrapped left text as fit beside the right text.
  const available = width - rightWidth - 1;
  const lines = wrapText(left, width);
  const words = lines.pop().split(" ");
  const tail = [];

  while (words.length && textWidth([words[words.length - 1], ...tail].join(" ")) <= available) {
    tail.unshift(words.pop());
  }

  if (words.length) {
    lines.push(words.join(" "));
  }

  const lastLeft = tail.join(" ");
  lines.push(`${lastLeft}${fill.repeat(width - textWidth(lastLeft) - rightWidth)}${right}`);
  return lines;
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
    const italicEnabled = Boolean(segment.italic);
    const prev = out[out.length - 1];

    if (prev && prev.bold === boldEnabled && prev.italic === italicEnabled) {
      prev.text += value;
      continue;
    }

    out.push({ text: value, bold: boldEnabled, italic: italicEnabled });
  }

  return out;
}

function segmentsToText(segments) {
  return normalizeSegments(segments)
    .map((segment) => segment.text)
    .join("");
}

function inlineToSegments(children, strictMarkdown = false, boldEnabled = false, italicEnabled = false) {
  if (!Array.isArray(children) || !children.length) {
    return [];
  }

  const out = [];

  for (let i = 0; i < children.length; i += 1) {
    const token = children[i];

    if (token.type === "text" || token.type === "code_inline") {
      out.push({ text: token.content, bold: boldEnabled, italic: italicEnabled });
      continue;
    }

    if (token.type === "html_inline") {
      if (strictMarkdown) {
        throw new Error(`Unsupported markdown construct: ${token.type}`);
      }
      out.push({ text: token.content, bold: boldEnabled, italic: italicEnabled });
      continue;
    }

    if (token.type === "softbreak" || token.type === "hardbreak") {
      out.push({ text: "\n", bold: boldEnabled, italic: italicEnabled });
      continue;
    }

    if (token.type === "strong_open") {
      const range = collectInlineRange(children, i, "strong_open", "strong_close");
      out.push(...inlineToSegments(range.inner, strictMarkdown, true, italicEnabled));
      i = range.endIndex;
      continue;
    }

    if (token.type === "em_open") {
      const range = collectInlineRange(children, i, "em_open", "em_close");
      out.push(...inlineToSegments(range.inner, strictMarkdown, boldEnabled, true));
      i = range.endIndex;
      continue;
    }

    if (token.type === "s_open") {
      const range = collectInlineRange(children, i, "s_open", "s_close");
      out.push(...inlineToSegments(range.inner, strictMarkdown, boldEnabled, italicEnabled));
      i = range.endIndex;
      continue;
    }

    if (token.type === "link_open") {
      const range = collectInlineRange(children, i, "link_open", "link_close");
      const label = segmentsToText(inlineToSegments(range.inner, strictMarkdown, false, false));
      out.push({ text: renderLink(label, token.attrGet("href")), bold: boldEnabled, italic: italicEnabled });
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
        rows[rows.length - 1].push({ text: parts[i], bold: segment.bold, italic: segment.italic });
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

  function appendSegment(target, value, enabledBold, enabledItalic) {
    if (!value) {
      return;
    }

    const boldValue = Boolean(enabledBold);
    const italicValue = Boolean(enabledItalic);
    const prev = target[target.length - 1];
    if (prev && prev.bold === boldValue && prev.italic === italicValue) {
      prev.text += value;
      return;
    }

    target.push({ text: value, bold: boldValue, italic: italicValue });
  }

  function pushPendingSpaces() {
    for (const part of pendingSpaces) {
      appendSegment(current, part.text, part.bold, part.italic);
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
        appendSegment(current, part.text.slice(start, start + take), part.bold, part.italic);
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
      if (prevPart && prevPart.bold === Boolean(segment.bold) && prevPart.italic === Boolean(segment.italic)) {
        prevPart.text += ch;
      } else {
        token.parts.push({ text: ch, bold: Boolean(segment.bold), italic: Boolean(segment.italic) });
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

function renderStyledLine(lineSegments, chunks, codePageName, prefix = "", replacements = null) {
  const parts = [];
  let activeBold = false;
  let activeItalic = false;

  if (prefix) {
    parts.push(encodeEscposText(prefix, codePageName, replacements));
  }

  for (const segment of normalizeSegments(lineSegments)) {
    const segmentBold = Boolean(segment.bold);
    const segmentItalic = Boolean(segment.italic);

    if (segmentBold !== activeBold) {
      parts.push(bold(segmentBold));
      activeBold = segmentBold;
    }

    if (segmentItalic !== activeItalic) {
      parts.push(italic(segmentItalic));
      activeItalic = segmentItalic;
    }

    parts.push(encodeEscposText(segment.text, codePageName, replacements));
  }

  if (activeBold) {
    parts.push(bold(false));
  }

  if (activeItalic) {
    parts.push(italic(false));
  }

  parts.push(LINE_FEED);
  chunks.push(concat(parts));
}

function renderWrappedSegments(segments, chunks, charsPerLine, codePageName, prefix = "", replacements = null, firstPrefix = null) {
  const safePrefix = String(prefix || "");
  const rowWidth = Math.max(1, charsPerLine - safePrefix.length);
  const rows = splitSegmentsByBreaks(segments);

  for (const row of rows) {
    const wrapped = splitSegmentsByWidth(row, rowWidth);

    for (const wrappedLine of wrapped) {
      renderStyledLine(wrappedLine, chunks, codePageName, firstPrefix ?? safePrefix, replacements);
      firstPrefix = null;
    }
  }
}

function renderHeading(level, text, chunks, charsPerLine, codePageName, replacements = null) {
  if (level === 1) {
    chunks.push(align("center"), bold(true), size(1, 1));
  } else if (level === 2) {
    chunks.push(align("center"), bold(true), size(1, 0));
  } else {
    chunks.push(align("left"), bold(true), size(0, 0));
  }

  for (const wrapped of wrapText(text, charsPerLine)) {
    chunks.push(encodedLine(wrapped, codePageName, replacements));
  }

  chunks.push(size(0, 0), bold(false), align("left"), encodedLine("", codePageName, replacements));
}

function renderParagraph(text, chunks, charsPerLine, codePageName, replacements = null) {
  const rows = String(text || "").split(/\r?\n/);
  for (const row of rows) {
    chunks.push(...renderWrappedPlainText(row, charsPerLine, codePageName, replacements));
  }
  chunks.push(encodedLine("", codePageName, replacements));
}

function renderParagraphInline(children, chunks, charsPerLine, strictMarkdown, codePageName, prefix = "", replacements = null) {
  const segments = inlineToSegments(children, strictMarkdown);
  renderWrappedSegments(segments, chunks, charsPerLine, codePageName, prefix, replacements);
  chunks.push(encodedLine("", codePageName, replacements));
}

function trimSegmentsEdge(segments, atStart) {
  const out = normalizeSegments(segments);

  while (out.length) {
    const index = atStart ? 0 : out.length - 1;
    out[index].text = atStart ? out[index].text.trimStart() : out[index].text.trimEnd();
    if (out[index].text) {
      break;
    }
    out.splice(index, 1);
  }

  return out;
}

function renderInlineChildrenWithImages(children, chunks, charsPerLine, strictMarkdown, codePageName, prefix = "", replacements = null, firstPrefix = null) {
  const buffered = [];
  const inlineChildren = Array.isArray(children) ? children : [];
  let afterRow = false;

  function flushBuffered(beforeRow = false) {
    let segments = inlineToSegments(buffered, strictMarkdown);
    // Rows print on their own lines: drop breaks and spaces touching them.
    if (afterRow) {
      segments = trimSegmentsEdge(segments, true);
    }
    if (beforeRow) {
      segments = trimSegmentsEdge(segments, false);
    }
    buffered.length = 0;
    afterRow = false;
    if (!segmentsToText(segments)) {
      return;
    }
    renderWrappedSegments(segments, chunks, charsPerLine, codePageName, prefix, replacements, firstPrefix);
    firstPrefix = null;
  }

  function renderRow(parsed) {
    flushBuffered(true);
    for (const value of layoutRow(parsed, Math.max(1, charsPerLine - textWidth(prefix)))) {
      chunks.push(encodedLine(`${firstPrefix ?? prefix}${value}`, codePageName, replacements));
      firstPrefix = null;
    }
    afterRow = true;
  }

  function consumeSpanningShortcode(startIndex) {
    const token = inlineChildren[startIndex];
    if (!token || (token.type !== "text" && token.type !== "code_inline")) {
      return null;
    }

    const value = String(token.content || "");
    const start = Math.max(value.lastIndexOf("{{qr:"), value.lastIndexOf("{{row:"));
    if (start === -1) {
      return null;
    }

    const isRow = value.startsWith("{{row:", start);
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

      if (isRow && /^(strong|em|s)_(open|close)$/.test(next.type)) {
        // Row text is printed plain: drop inline emphasis markers.
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
      chunks.push(LINE_FEED);
      chunks.push(align("left"));
      continue;
    }

    if (token.type === "text" || token.type === "code_inline") {
      const spanning = consumeSpanningShortcode(i);
      const source = spanning ? spanning.content : String(token.content || "");
      if (spanning) {
        i = spanning.endIndex;
      }

      const parts = scanTextForShortcodes(source);

      for (const part of parts) {
        if (part.type === "text") {
          if (part.value) {
            buffered.push({ ...token, type: "text", content: part.value });
          }
          continue;
        }

        if (part.type === "row") {
          try {
            renderRow(parseRowShortcode(part.raw));
          } catch (error) {
            const message = `Invalid row shortcode "${part.raw}": ${error.message}`;
            if (strictMarkdown) {
              throw new Error(message);
            }
            console.warn(message);
            buffered.push({ ...token, type: "text", content: part.raw });
          }
          continue;
        }

        flushBuffered();

        try {
          const parsed = parseQrShortcode(part.raw);
          chunks.push(align("center"));
          chunks.push(qrCode(parsed));
          chunks.push(LINE_FEED);
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

function childrenContainShortcode(children, opener) {
  return Array.isArray(children) && children.some((token) => {
    if (token.type !== "text" && token.type !== "code_inline") {
      return false;
    }
    return String(token.content || "").includes(opener);
  });
}

function normalizeTaskMarkersInSegments(segments) {
  return normalizeSegments(segments).map((segment) => ({
    text: segment.text.replace(/\[X\]/g, "[x]"),
    bold: segment.bold,
    italic: segment.italic
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

function renderCodeBlock(text, chunks, charsPerLine, codePageName, replacements = null) {
  const rows = String(text || "").split(/\r?\n/);
  for (const row of rows) {
    chunks.push(...renderWrappedPlainText(row, charsPerLine, codePageName, replacements));
  }
  chunks.push(encodedLine("", codePageName, replacements));
}

function toDots(mm) {
  return Math.round(mm * 8);
}

function parseOptionalMm(value, name, { min, exclusiveMin = false }) {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${name}. Provide a numeric value in millimeters.`);
  }

  if (exclusiveMin ? numeric <= min : numeric < min) {
    const relation = exclusiveMin ? "greater than" : "greater than or equal to";
    throw new Error(`Invalid ${name}. Provide a value ${relation} ${min} mm.`);
  }

  return numeric;
}

function parseLayoutOptions(options = {}) {
  const out = {};

  if (options.font != null) {
    const normalized = String(options.font).trim().toUpperCase();
    if (!["A", "B", "C"].includes(normalized)) {
      throw new Error("Invalid font. Use A, B, or C.");
    }
    out.font = normalized;
  }

  const characterSpacingMm = parseOptionalMm(options.characterSpacingMm, "characterSpacingMm", { min: 0 });
  if (characterSpacingMm != null) {
    out.characterSpacingDots = toDots(characterSpacingMm);
  }

  const lineSpacingMm = parseOptionalMm(options.lineSpacingMm, "lineSpacingMm", { min: 0, exclusiveMin: true });
  if (lineSpacingMm != null) {
    out.lineSpacingDots = toDots(lineSpacingMm);
  }

  const leftMarginMm = parseOptionalMm(options.leftMarginMm, "leftMarginMm", { min: 0 });
  if (leftMarginMm != null) {
    out.leftMarginDots = toDots(leftMarginMm);
  }

  const printAreaWidthMm = parseOptionalMm(options.printAreaWidthMm, "printAreaWidthMm", { min: 0, exclusiveMin: true });
  if (printAreaWidthMm != null) {
    out.printAreaWidthDots = toDots(printAreaWidthMm);
  }

  return out;
}

function markdownToEscposDetailed(markdown, options = {}) {
  const charsPerLine = Number.isInteger(options.charsPerLine) ? options.charsPerLine : 42;
  const strictMarkdown = Boolean(options.strictMarkdown);
  const selectedCodePage = resolveCodePage(options.codePage || "cp858");
  const md = new MarkdownIt({ html: true, linkify: true, breaks: false });
  const tokens = md.parse(String(markdown || ""), {});
  const chunks = [init(), setInternationalCharset(0), setCodePage(selectedCodePage.escposId)];
  const replacements = [];
  const layoutOptions = parseLayoutOptions(options);

  if (layoutOptions.font) {
    chunks.push(font(layoutOptions.font));
  }

  if (layoutOptions.characterSpacingDots != null) {
    chunks.push(characterSpacing(layoutOptions.characterSpacingDots));
  }

  if (layoutOptions.lineSpacingDots != null) {
    chunks.push(lineSpacing(layoutOptions.lineSpacingDots));
  }

  if (layoutOptions.leftMarginDots != null) {
    chunks.push(leftMargin(layoutOptions.leftMarginDots));
  }

  if (layoutOptions.printAreaWidthDots != null) {
    chunks.push(printAreaWidth(layoutOptions.printAreaWidthDots));
  }

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
      renderHeading(level, text, chunks, charsPerLine, selectedCodePage.name, replacements);
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
        const hasQrShortcode = childrenContainShortcode(children, "{{qr:");

        if (hasImage || hasQrShortcode) {
          if (currentListItem && !currentListItem.hasRenderedContent) {
            const indent = getListIndent(listItemDepth);
            chunks.push(line(`${quotePrefix}${indent}${currentListItem.marker} `));
            currentListItem.hasRenderedContent = true;
          }

          renderInlineChildrenWithImages(
            children,
            chunks,
            charsPerLine,
            strictMarkdown,
            selectedCodePage.name,
            `${quotePrefix}${getListIndent(listItemDepth)}  `,
            replacements
          );
          chunks.push(line(""));
          i += 2;
          continue;
        }

        if (currentListItem && childrenContainShortcode(children, "{{row:")) {
          // Hanging indent: the marker leads the first line, later lines align under the item text.
          const indent = `${quotePrefix}${getListIndent(listItemDepth)}`;
          const marker = `${currentListItem.marker} `;
          const firstPrefix = currentListItem.hasRenderedContent ? null : `${indent}${marker}`;
          currentListItem.hasRenderedContent = true;

          const hanging = `${indent}${" ".repeat(marker.length)}`;
          renderInlineChildrenWithImages(children, chunks, charsPerLine, strictMarkdown, selectedCodePage.name, hanging, replacements, firstPrefix);
          chunks.push(line(""));
          i += 2;
          continue;
        }

        let segments = inlineToSegments(children, strictMarkdown);

        if (currentListItem && !currentListItem.hasRenderedContent) {
          const indent = getListIndent(listItemDepth);
          segments = normalizeTaskMarkersInSegments(segments);
          segments = [{ text: `${indent}${currentListItem.marker} `, bold: false, italic: false }, ...segments];
          currentListItem.hasRenderedContent = true;
        }

        renderWrappedSegments(segments, chunks, charsPerLine, selectedCodePage.name, quotePrefix, replacements);
        chunks.push(line(""));
        i += 2;
        continue;
      }

      renderInlineChildrenWithImages(children, chunks, charsPerLine, strictMarkdown, selectedCodePage.name, quotePrefix, replacements);
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
      renderCodeBlock(token.content, chunks, charsPerLine, selectedCodePage.name, replacements);
      continue;
    }

    if (token.type === "html_block" || token.type === "html_inline") {
      if (strictMarkdown) {
        throw new Error(`Unsupported markdown construct: ${token.type}`);
      }
      chunks.push(...renderWrappedPlainText(token.content, charsPerLine, selectedCodePage.name, replacements));
      continue;
    }
  }

  chunks.push(feed(4), cut(true));
  return {
    bytes: concat(chunks),
    replacements
  };
}

function markdownToEscpos(markdown, options = {}) {
  return markdownToEscposDetailed(markdown, options).bytes;
}

module.exports = {
  markdownToEscpos,
  markdownToEscposDetailed,
  wrapText,
  renderHeading,
  renderParagraph,
  renderListItem,
  renderRule,
  renderCodeBlock,
  renderLink
};
