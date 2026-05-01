"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCodePage, getSupportedCodePages, encodeText } = require("../src/text-transcoder");

test("resolveCodePage returns cp850 metadata and escpos id", () => {
  const page = resolveCodePage("cp850");
  assert.equal(page.name, "cp850");
  assert.equal(page.escposId, 2);
});

test("getSupportedCodePages lists cp850", () => {
  const pages = getSupportedCodePages();
  assert.deepEqual(pages, [{ name: "cp850", escposId: 2 }]);
});

test("encodeText emits cp850 bytes for representative Western chars", () => {
  const out = Buffer.from(encodeText("°äöüßéèàñ", { codePage: "cp850" }));
  assert.deepEqual(Array.from(out), [0xf8, 0x84, 0x94, 0x81, 0xe1, 0x82, 0x8a, 0x85, 0xa4]);
});

test("encodeText keeps ASCII unchanged", () => {
  const out = Buffer.from(encodeText("Hello-123", { codePage: "cp850" }));
  assert.deepEqual(Array.from(out), Array.from(Buffer.from("Hello-123", "ascii")));
});

test("encodeText falls back to deterministic '?' when char is not encodable", () => {
  const out = Buffer.from(encodeText("ok λ", { codePage: "cp850" }));
  assert.equal(out.includes(Buffer.from("ok ?", "ascii")), true);
});

test("resolveCodePage throws for unknown page", () => {
  assert.throws(() => resolveCodePage("cp9999"), /Unsupported code page/i);
});
