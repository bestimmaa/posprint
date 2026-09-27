"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const b = require("../src/escpos-builder");
const { previewEscpos } = require("../src/escpos-preview");
const { markdownToEscpos } = require("../src/markdown-to-escpos");
const { encodeText, decodeText } = require("../src/text-transcoder");
const api = require("../src/index");

function inner(output) {
  // Strip the top/bottom border and the side frame characters.
  const lines = output.split("\n");
  return lines.slice(1, -1).map((line) => line.slice(1, -1));
}

test("index exports previewEscpos", () => {
  assert.equal(typeof api.previewEscpos, "function");
});

test("frames output with a border matching charsPerLine", () => {
  const out = previewEscpos(b.concat([b.init(), b.line("hi")]), { charsPerLine: 10 });
  const lines = out.split("\n");
  assert.equal(lines[0], "+----------+");
  assert.equal(lines[1], "|hi        |");
  assert.equal(lines[lines.length - 1], "+----------+");
  for (const line of lines) {
    assert.equal(Array.from(line).length, 12);
  }
});

test("applies left, center, and right alignment", () => {
  const out = previewEscpos(
    b.concat([
      b.init(),
      b.line("L"),
      b.align("center"),
      b.line("CC"),
      b.align("right"),
      b.line("R")
    ]),
    { charsPerLine: 10 }
  );
  assert.deepEqual(inner(out), ["L         ", "    CC    ", "         R"]);
});

test("defaults to 42 characters per line", () => {
  const out = previewEscpos(b.concat([b.init(), b.line("x")]));
  assert.equal(out.split("\n")[0], `+${"-".repeat(42)}+`);
});

test("renders double-width text spaced out and resets with GS !", () => {
  const out = previewEscpos(
    b.concat([b.init(), b.align("center"), b.size(1, 1), b.line("Hey"), b.size(0, 0), b.line("ok")]),
    { charsPerLine: 12 }
  );
  assert.deepEqual(inner(out), ["   H e y    ", "     ok     "]);
});

test("wraps double-width text when it exceeds the line width", () => {
  const out = previewEscpos(b.concat([b.init(), b.size(1, 0), b.line("abcdef")]), { charsPerLine: 8 });
  assert.deepEqual(inner(out), ["a b c d ", "e f     "]);
});

test("renders markdown heading as centered double-width text", () => {
  const out = previewEscpos(markdownToEscpos("# Cafe\n\nhello", { charsPerLine: 20 }), { charsPerLine: 20 });
  const lines = inner(out);
  assert.equal(lines[0], "      C a f e       ");
  assert.equal(lines.includes("hello               "), true);
});

test("bold is plain by default and uses ANSI when requested", () => {
  const bytes = b.concat([b.init(), b.bold(true), b.text("B"), b.bold(false), b.line("n")]);
  assert.equal(previewEscpos(bytes, { charsPerLine: 4 }).includes("\x1b["), false);
  const ansi = previewEscpos(bytes, { charsPerLine: 4, ansi: true });
  assert.match(ansi, /\|\x1b\[1mB\x1b\[0mn {2}\|/);
});

test("decodes non-ASCII text with the active code page (cp858)", () => {
  const encoded = encodeText("€ ä ß", { codePage: "cp858" });
  const out = previewEscpos(
    b.concat([b.init(), b.setCodePage(19), encoded, Uint8Array.of(0x0a)]),
    { charsPerLine: 10 }
  );
  assert.equal(inner(out)[0], "€ ä ß     ");
});

test("decodes bytes differently when the code page changes", () => {
  const out = previewEscpos(
    b.concat([b.init(), b.setCodePage(16), Uint8Array.of(0x80, 0x0a), b.setCodePage(19), Uint8Array.of(0x84, 0x0a)]),
    { charsPerLine: 4 }
  );
  assert.deepEqual(inner(out), ["€   ", "ä   "]);
});

test("decodeText maps bytes back to Unicode", () => {
  assert.equal(decodeText(encodeText("Grüße €5", { codePage: "cp858" }), { codePage: "cp858" }), "Grüße €5");
});

test("markdown with cp858 characters round-trips through the preview", () => {
  const out = previewEscpos(markdownToEscpos("Preis: 3,50 € für Äpfel", { codePage: "cp858" }));
  assert.equal(out.includes("Preis: 3,50 € für Äpfel"), true);
});

test("renders raster image placeholder with dimensions and alignment", () => {
  const raster = b.rasterImage({ width: 16, height: 3, data: new Uint8Array(6).fill(0xff) });
  const out = previewEscpos(
    b.concat([b.init(), b.align("center"), raster, b.align("left"), b.line("after")]),
    { charsPerLine: 20 }
  );
  const lines = inner(out);
  assert.equal(lines[0], "    [image 16x3]    ");
  assert.equal(lines[1], "after               ");
});

test("raster payload bytes are skipped even when they look like commands", () => {
  const data = Uint8Array.of(0x0a, 0x1b, 0x40, 0x41, 0x1d, 0x56);
  const raster = b.rasterImage({ width: 8, height: 6, data });
  const out = previewEscpos(b.concat([b.init(), raster, b.line("ok")]), { charsPerLine: 14 });
  assert.deepEqual(inner(out), ["[image 8x6]   ", "ok            "]);
});

test("renders QR placeholder with its payload", () => {
  const out = previewEscpos(
    b.concat([b.init(), b.align("center"), b.qrCode({ payload: "https://x.io" }), b.line("")]),
    { charsPerLine: 24 }
  );
  assert.equal(inner(out)[0], "   [QR: https://x.io]   ");
});

test("renders cut marker and drawer pulse", () => {
  const out = previewEscpos(
    b.concat([b.init(), b.line("bye"), b.pulseDrawer(), b.feed(2), b.cut(true)]),
    { charsPerLine: 20 }
  );
  const lines = inner(out);
  assert.equal(lines[0], "bye                 ");
  assert.equal(lines[1].trim(), "[drawer]");
  assert.equal(lines[2].trim(), "");
  assert.equal(lines[3].trim(), "");
  assert.match(lines[4], /^[- ]+✂ cut [- ]+$/);
  assert.equal(Array.from(lines[4]).length, 20);
});

test("ESC d prints pending text as the first fed line", () => {
  const out = previewEscpos(b.concat([b.init(), b.text("x"), b.feed(2)]), { charsPerLine: 3 });
  assert.deepEqual(inner(out), ["x  ", "   "]);
});

test("left margin and print area width narrow the layout", () => {
  const out = previewEscpos(
    b.concat([b.init(), b.leftMargin(24), b.printAreaWidth(96), b.align("right"), b.line("ab")]),
    { charsPerLine: 12 }
  );
  assert.equal(inner(out)[0], "        ab  ");
});

test("skips layout commands without printing them", () => {
  const out = previewEscpos(
    b.concat([
      b.init(),
      b.setInternationalCharset(2),
      b.font("B"),
      b.characterSpacing(3),
      b.lineSpacing(40),
      b.italic(true),
      b.line("plain"),
      b.italic(false)
    ]),
    { charsPerLine: 8 }
  );
  assert.deepEqual(inner(out), ["plain   "]);
});

test("unknown and truncated commands do not crash", () => {
  const junk = Uint8Array.of(
    0x1b, 0x7e, // unknown ESC command
    0x41, 0x0a,
    0x1d, 0x99, // unknown GS command
    0x1c, 0x2e, // FS .
    0x10, 0x04, 0x01, // DLE EOT
    0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x45, // GS ( L function
    0x42, 0x0a,
    0x1d, 0x76, 0x30, 0x00, 0xff, 0xff, 0xff, 0xff // truncated raster header
  );
  const out = previewEscpos(junk, { charsPerLine: 20 });
  const lines = inner(out);
  assert.equal(lines[0].trim(), "A");
  assert.equal(lines[1].trim(), "B");

  for (const tail of [[0x1b], [0x1d], [0x1d, 0x28, 0x6b, 0xff], [0x1b, 0x2a, 0x21]]) {
    assert.doesNotThrow(() => previewEscpos(Uint8Array.from(tail)));
  }
});

test("accepts Buffer and plain arrays but rejects other input", () => {
  assert.doesNotThrow(() => previewEscpos(Buffer.from("hi\n")));
  assert.doesNotThrow(() => previewEscpos([0x68, 0x0a]));
  assert.throws(() => previewEscpos(null), /expects a Uint8Array/);
});

test("showcase fixture preview contains stable key lines", () => {
  const fixture = path.resolve(__dirname, "fixtures", "fixture-markdown-showcase.md");
  const markdown = fs.readFileSync(fixture, "utf8");
  const previous = process.cwd();
  process.chdir(path.resolve(__dirname, ".."));

  let out;
  try {
    out = previewEscpos(markdownToEscpos(markdown, { charsPerLine: 42 }), { charsPerLine: 42 });
  } finally {
    process.chdir(previous);
  }

  const lines = out.split("\n");
  const border = `+${"-".repeat(42)}+`;
  assert.equal(lines[0], border);
  assert.equal(lines[lines.length - 1], border);
  for (const line of lines) {
    assert.equal(Array.from(line).length, 44, `unexpected width: ${line}`);
  }

  assert.equal(lines[1], "|       N o r t h w i n d   C a f e        |");
  assert.equal(lines.includes("|123 Harbor St, Seattle                    |"), true);
  assert.equal(lines.includes("|TOTAL $7.75                               |"), true);
  assert.equal(lines.includes("|        O r d e r   S u m m a r y         |"), true);
  assert.equal(lines.includes("|- [x] Grinder calibrated                  |"), true);
  assert.equal(lines.includes("|              [image 64x24]               |"), true);
  assert.equal(lines.includes("| [QR: https://www.northwind.com/rewards]  |"), true);
  assert.equal(lines.includes("|SHIFT OPEN 07:00                          |"), true);
  assert.match(lines[lines.length - 2], /^\|[- ]+✂ cut [- ]+\|$/);
});
