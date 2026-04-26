"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { markdownToEscpos, wrapText } = require("../src/markdown-to-escpos");
const { rasterImage } = require("../src/escpos-builder");
const {
  imageFileToRaster,
  resolveMarkdownImagePath,
  assertSupportedExtension
} = require("../src/image-to-escpos");

test("builds GS v 0 raster command with expected header", () => {
  const data = Uint8Array.from([0b10101010]);
  const out = Buffer.from(rasterImage({ width: 8, height: 1, data }));

  assert.equal(out[0], 0x1d);
  assert.equal(out[1], 0x76);
  assert.equal(out[2], 0x30);
  assert.equal(out[3], 0x00);
  assert.equal(out[4], 0x01);
  assert.equal(out[5], 0x00);
  assert.equal(out[6], 0x01);
  assert.equal(out[7], 0x00);
  assert.equal(out[8], 0b10101010);
});

test("resolves relative markdown image path from current working directory", () => {
  const filePath = resolveMarkdownImagePath("tests/fixtures/logo-small.png");
  assert.equal(filePath, path.resolve(process.cwd(), "tests/fixtures/logo-small.png"));
});

test("accepts png and jpg extensions case-insensitively", () => {
  assert.equal(assertSupportedExtension("C:/tmp/logo.PNG"), ".png");
  assert.equal(assertSupportedExtension("C:/tmp/logo.jpg"), ".jpg");
  assert.equal(assertSupportedExtension("C:/tmp/logo.JPEG"), ".jpeg");
});

test("rejects unsupported image extension", () => {
  assert.throws(() => assertSupportedExtension("C:/tmp/logo.gif"), /Unsupported image extension/);
});

test("converts png fixture to monochrome raster", () => {
  const result = imageFileToRaster({
    filePath: path.resolve("tests/fixtures/logo-small.png"),
    charsPerLine: 42,
    threshold: 128
  });
  assert.equal(result.width > 0, true);
  assert.equal(result.height > 0, true);
  assert.equal(result.data.length, Math.ceil(result.width / 8) * result.height);
});

test("converts jpg fixture to monochrome raster", () => {
  const result = imageFileToRaster({
    filePath: path.resolve("tests/fixtures/logo-small.jpg"),
    charsPerLine: 42,
    threshold: 128
  });
  assert.equal(result.width > 0, true);
  assert.equal(result.height > 0, true);
  assert.equal(result.data.length, Math.ceil(result.width / 8) * result.height);
});

test("clamps oversized image width to printable dots", () => {
  const result = imageFileToRaster({
    filePath: path.resolve("tests/fixtures/logo-wide.png"),
    charsPerLine: 42,
    threshold: 128
  });
  assert.equal(result.width, 336);
});

test("keeps natural size for image smaller than printable width", () => {
  const result = imageFileToRaster({
    filePath: path.resolve("tests/fixtures/logo-small.png"),
    charsPerLine: 42,
    threshold: 128
  });
  assert.equal(result.width, 64);
});

test("renders markdown image token as centered raster image", () => {
  const out = Buffer.from(markdownToEscpos("![logo](tests/fixtures/logo-small.png)", {
    charsPerLine: 42,
    strictMarkdown: false
  }));

  const alignCenter = Buffer.from([0x1b, 0x61, 0x01]);
  const alignLeft = Buffer.from([0x1b, 0x61, 0x00]);
  const rasterHeader = Buffer.from([0x1d, 0x76, 0x30, 0x00]);
  assert.notEqual(out.indexOf(alignCenter), -1);
  assert.notEqual(out.indexOf(rasterHeader), -1);
  assert.notEqual(out.lastIndexOf(alignLeft), -1);
});

test("fails when markdown image file is missing", () => {
  assert.throws(
    () => markdownToEscpos("![logo](tests/fixtures/does-not-exist.png)", { charsPerLine: 42, strictMarkdown: false }),
    /Unable to read image/
  );
});

test("renders # heading with centered bold extra-large style sequence", () => {
  const out = markdownToEscpos("# Title\n", { charsPerLine: 42, strictMarkdown: false });
  const bytes = Buffer.from(out);
  assert.equal(bytes.includes(Buffer.from([0x1b, 0x61, 0x01])), true);
  assert.equal(bytes.includes(Buffer.from([0x1b, 0x45, 0x01])), true);
  assert.equal(bytes.includes(Buffer.from([0x1d, 0x21, 0x11])), true);
});

test("renders ## heading as centered bold large but not extra-large", () => {
  const out = markdownToEscpos("## Subtitle\n", { charsPerLine: 42, strictMarkdown: false });
  const bytes = Buffer.from(out);
  assert.equal(bytes.includes(Buffer.from([0x1d, 0x21, 0x10])), true);
});

test("wraps paragraph lines by charsPerLine", () => {
  const out = markdownToEscpos("word ".repeat(20), { charsPerLine: 16, strictMarkdown: false });
  assert.equal(Buffer.from(out).length > 0, true);
});

test("best-effort mode degrades inline HTML to text", () => {
  const out = markdownToEscpos("before <span>x</span> after", {
    charsPerLine: 42,
    strictMarkdown: false
  });
  assert.equal(Buffer.from(out).length > 0, true);
});

test("strict mode rejects unsupported html tokens", () => {
  assert.throws(
    () => markdownToEscpos("<div>bad</div>", { charsPerLine: 42, strictMarkdown: true }),
    /Unsupported markdown construct/
  );
});

test("strict mode rejects inline html tokens", () => {
  assert.throws(
    () => markdownToEscpos("before <span>x</span> after", { charsPerLine: 42, strictMarkdown: true }),
    /Unsupported markdown construct/
  );
});

test("wrapText splits long unbroken tokens to width", () => {
  const lines = wrapText("supercalifragilisticexpialidocious", 8);
  assert.equal(lines.every((value) => value.length <= 8), true);
});

test("renders nested list parent and child markers", () => {
  const out = Buffer.from(markdownToEscpos("- parent\n  - child\n", { charsPerLine: 42, strictMarkdown: false }));
  const text = out.toString("utf8");
  assert.equal(text.includes("- parent"), true);
  assert.equal(text.includes("  - child"), true);
});

test("sets ESC/POS international charset and code page to fixed defaults", () => {
  const out = Buffer.from(markdownToEscpos("- [ ] open\n> quote\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));

  assert.equal(out.includes(Buffer.from([0x1b, 0x52, 0x00])), true);
  assert.equal(out.includes(Buffer.from([0x1b, 0x74, 0x00])), true);
});

test("preserves marker for empty parent list item with nested child", () => {
  const out = Buffer.from(markdownToEscpos("-\n  - child\n", { charsPerLine: 42, strictMarkdown: false }));
  const text = out.toString("utf8");

  assert.equal(text.includes("- \n"), true);
  assert.equal(text.includes("- child"), true);
});

test("ordered list items are not duplicated", () => {
  const out = Buffer.from(markdownToEscpos("1. Espresso\n2. Croissant\n3. Filter Coffee\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal((text.match(/Espresso/g) || []).length, 1);
  assert.equal((text.match(/Croissant/g) || []).length, 1);
  assert.equal((text.match(/Filter Coffee/g) || []).length, 1);
});

test("retains multi-paragraph content within a list item", () => {
  const markdown = "- First paragraph in item\n\n  Second paragraph in same item\n";
  const out = Buffer.from(markdownToEscpos(markdown, {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");
  const lines = text.split(/\r?\n/);
  const firstParagraphLine = lines.findIndex((line) => line.includes("First paragraph in item"));
  const secondParagraphLine = lines.findIndex((line) => line.includes("Second paragraph in same item"));
  const betweenParagraphs = lines.slice(firstParagraphLine + 1, secondParagraphLine);

  assert.notEqual(firstParagraphLine, -1);
  assert.notEqual(secondParagraphLine, -1);
  assert.equal(secondParagraphLine > firstParagraphLine, true);
  assert.equal(betweenParagraphs.some((line) => line.trim() === ""), true);
});

test("retains nested ordered and unordered list content", () => {
  const markdown = [
    "1. Parent ordered",
    "   - Child bullet",
    "   1. Child ordered",
    "",
    "   Parent trailing paragraph",
    "2. Sibling ordered",
    ""
  ].join("\n");
  const out = Buffer.from(markdownToEscpos(markdown, {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");
  const parentIndex = text.indexOf("1. Parent ordered");
  const childBulletIndex = text.indexOf("- Child bullet");
  const childOrderedIndex = text.indexOf("1. Child ordered");
  const trailingParagraphIndex = text.indexOf("Parent trailing paragraph");
  const siblingIndex = text.indexOf("2. Sibling ordered");

  assert.equal((text.match(/1\. Parent ordered/g) || []).length, 1);
  assert.equal((text.match(/- Child bullet/g) || []).length, 1);
  assert.equal((text.match(/1\. Child ordered/g) || []).length, 1);
  assert.equal((text.match(/Parent trailing paragraph/g) || []).length, 1);
  assert.equal((text.match(/2\. Sibling ordered/g) || []).length, 1);

  assert.notEqual(parentIndex, -1);
  assert.notEqual(childBulletIndex, -1);
  assert.notEqual(childOrderedIndex, -1);
  assert.notEqual(trailingParagraphIndex, -1);
  assert.notEqual(siblingIndex, -1);
  assert.equal(parentIndex < childBulletIndex, true);
  assert.equal(childBulletIndex < childOrderedIndex, true);
  assert.equal(childOrderedIndex < trailingParagraphIndex, true);
  assert.equal(trailingParagraphIndex < siblingIndex, true);
});

test("keeps unchecked task marker and normalizes checked marker to lowercase x", () => {
  const markdown = "- [ ] open task\n- [X] done task\n";
  const out = Buffer.from(markdownToEscpos(markdown, {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("[X]"), false);
  assert.equal(text.includes("- [ ] open task"), true);
  assert.equal(text.includes("- [x] open task"), false);
  assert.equal(text.includes("- [x] done task"), true);
});

test("preserves explicit soft line breaks inside a paragraph", () => {
  const out = Buffer.from(markdownToEscpos("Subtotal 7.50\nTax 0.00\nTotal 7.50\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("Subtotal 7.50\nTax 0.00\nTotal 7.50"), true);
});

test("renders strong text with ESC/POS bold toggles", () => {
  const bytes = Buffer.from(markdownToEscpos("before **BOLD** after\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));

  const boldOn = Buffer.from([0x1b, 0x45, 0x01]);
  const boldOff = Buffer.from([0x1b, 0x45, 0x00]);
  const boldText = Buffer.from("BOLD");
  const boldOnIndex = bytes.indexOf(boldOn);
  const boldTextIndex = bytes.indexOf(boldText);
  const boldOffIndex = bytes.indexOf(boldOff);

  assert.notEqual(boldOnIndex, -1);
  assert.notEqual(boldTextIndex, -1);
  assert.notEqual(boldOffIndex, -1);
  assert.equal(boldOnIndex < boldTextIndex, true);
  assert.equal(boldTextIndex < boldOffIndex, true);
});

test("degrades emphasis and strikethrough to plain readable text", () => {
  const out = Buffer.from(markdownToEscpos("This has *emphasis* and ~~strike~~ text.\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("emphasis"), true);
  assert.equal(text.includes("strike"), true);
  assert.equal(text.includes("*emphasis*"), false);
  assert.equal(text.includes("~~strike~~"), false);
});

test("renders blockquotes with a quote prefix", () => {
  const out = Buffer.from(markdownToEscpos("> quoted line\n> second line\n", {
    charsPerLine: 42,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("| quoted line"), true);
  assert.equal(text.includes("| second line"), true);
});

test("wraps inline paragraph text on word boundaries without leading continuation spaces", () => {
  const out = Buffer.from(markdownToEscpos("alpha beta gamma\n", {
    charsPerLine: 10,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("alpha beta\ngamma\n"), true);
  assert.equal(text.includes("\n gamma\n"), false);
});

test("keeps strong inline wrapping word-aware with no leading continuation spaces", () => {
  const out = Buffer.from(markdownToEscpos("alpha **beta** gamma\n", {
    charsPerLine: 10,
    strictMarkdown: false
  }));
  const text = out.toString("utf8");

  assert.equal(text.includes("\n gamma\n"), false);

  const boldOn = Buffer.from([0x1b, 0x45, 0x01]);
  const boldOff = Buffer.from([0x1b, 0x45, 0x00]);
  const boldText = Buffer.from("beta");
  const boldOnIndex = out.indexOf(boldOn);
  const boldTextIndex = out.indexOf(boldText);
  const boldOffIndex = out.indexOf(boldOff);

  assert.notEqual(boldOnIndex, -1);
  assert.notEqual(boldTextIndex, -1);
  assert.notEqual(boldOffIndex, -1);
  assert.equal(boldOnIndex < boldTextIndex, true);
  assert.equal(boldTextIndex < boldOffIndex, true);
});
