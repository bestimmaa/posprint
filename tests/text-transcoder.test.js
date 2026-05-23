"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const transcoderModulePath = require.resolve("../src/text-transcoder");

function reloadTextTranscoder() {
  delete require.cache[transcoderModulePath];
  const moduleExports = require("../src/text-transcoder");
  delete require.cache[transcoderModulePath];
  return moduleExports;
}

const {
  resolveCodePage,
  getSupportedCodePages,
  encodeText,
  encodeTextDetailed
} = reloadTextTranscoder();

const COVERAGE_CASES = [
  {
    codePage: "cp437",
    cases: [
      { text: "Çüéâäàåç", bytes: [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87] },
      { text: "¢£¥₧ƒ", bytes: [0x9b, 0x9c, 0x9d, 0x9e, 0x9f] },
      { text: "αßΓπΣσµτΦΘΩδ∞φ", bytes: [0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed] },
      { text: "°∙·√ⁿ²■", bytes: [0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe] }
    ]
  },
  {
    codePage: "cp850",
    cases: [
      { text: "Çüéâäàåç", bytes: [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87] },
      { text: "ø£Ø×ƒ", bytes: [0x9b, 0x9c, 0x9d, 0x9e, 0x9f] },
      { text: "ÁÂÀ©", bytes: [0xb5, 0xb6, 0xb7, 0xb8] },
      { text: "ðÐÊËÈıÍÎÏ", bytes: [0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8] },
      { text: "÷¸°¨·¹³²■", bytes: [0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe] }
    ]
  },
  {
    codePage: "cp858",
    cases: [
      { text: "Çüéâäàåç", bytes: [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87] },
      { text: "ø£Ø×ƒ", bytes: [0x9b, 0x9c, 0x9d, 0x9e, 0x9f] },
      { text: "ÁÂÀ©", bytes: [0xb5, 0xb6, 0xb7, 0xb8] },
      { text: "ðÐÊËÈ€ÍÎÏ", bytes: [0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8] },
      { text: "÷¸°¨·¹³²■", bytes: [0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe] }
    ]
  },
  {
    codePage: "cp1252",
    cases: [
      { text: "€‚ƒ„…†‡ˆ‰Š‹Œ", bytes: [0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c] },
      { text: "Ž•˜™š›œžŸ", bytes: [0x8e, 0x95, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f] },
      { text: "¡¢£¤¥¦§¨©ª«¬­®¯", bytes: [0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xad, 0xae, 0xaf] },
      { text: "°±²³´µ¶·¸¹º»¼½¾¿", bytes: [0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf] },
      { text: "ÀÁÂÃÄÅÆÇàáâãäåæç", bytes: [0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7] }
    ]
  }
];

test("resolveCodePage defaults to cp858 metadata and escpos id", () => {
  const page = resolveCodePage();
  assert.equal(page.name, "cp858");
  assert.equal(page.escposId, 19);
});

test("resolveCodePage returns cp437 and cp1252 metadata and escpos ids", () => {
  assert.equal(resolveCodePage("cp437").escposId, 0);
  assert.equal(resolveCodePage("cp1252").escposId, 16);
});

test("getSupportedCodePages lists cp437, cp850, cp858, cp1252", () => {
  const pages = getSupportedCodePages();
  assert.deepEqual(pages, [
    { name: "cp437", escposId: 0 },
    { name: "cp850", escposId: 2 },
    { name: "cp858", escposId: 19 },
    { name: "cp1252", escposId: 16 }
  ]);
});

test("encodeText emits cp850 bytes for representative Western chars", () => {
  const out = Buffer.from(encodeText("°äöüßéèàñ", { codePage: "cp850" }));
  assert.deepEqual(Array.from(out), [0xf8, 0x84, 0x94, 0x81, 0xe1, 0x82, 0x8a, 0x85, 0xa4]);
});

test("encodeText covers representative supported characters across all code pages", () => {
  for (const { codePage, cases } of COVERAGE_CASES) {
    for (const { text, bytes } of cases) {
      assert.deepEqual(Array.from(encodeText(text, { codePage })), bytes, `${codePage}: ${text}`);
    }
  }
});

test("encodeText emits cp858 euro byte", () => {
  const out = Buffer.from(encodeText("Total 12.50 €", { codePage: "cp858" }));
  assert.notEqual(out.indexOf(Buffer.from([0xd5])), -1);
});

test("encodeText normalizes smart punctuation to ASCII on cp1252", () => {
  const out = Buffer.from(encodeText("\u201cHi\u201d \u2014 ok", { codePage: "cp1252" }));
  assert.deepEqual(Array.from(out), Array.from(Buffer.from('"Hi" - ok', "ascii")));
});

test("encodeText keeps ASCII unchanged", () => {
  const out = Buffer.from(encodeText("Hello-123", { codePage: "cp437" }));
  assert.deepEqual(Array.from(out), Array.from(Buffer.from("Hello-123", "ascii")));
});

test("encodeText normalizes smart quotes to ASCII quotes on cp850", () => {
  const out = Buffer.from(encodeText("“Strange” ‘allies’", { codePage: "cp850" }));
  assert.equal(out.includes(Buffer.from('"Strange" \'allies\'', "ascii")), true);
});

test("encodeText normalizes unicode dashes and non-breaking spaces only when needed", () => {
  const out = Buffer.from(encodeText("a—b c d", { codePage: "cp437" }));
  assert.deepEqual(Array.from(out), Array.from(Buffer.from("a-b c d", "ascii")));
});

test("encodeText keeps degree sign when the selected code page supports it", () => {
  const out = Buffer.from(encodeText("21.5°C", { codePage: "cp850" }));
  assert.deepEqual(Array.from(out), [0x32, 0x31, 0x2e, 0x35, 0xf8, 0x43]);
});

test("encodeText removes non-breaking spacing around degree sign without rewriting it to deg", () => {
  const out = Buffer.from(encodeText("21.5 °C", { codePage: "cp1252" }));
  assert.deepEqual(Array.from(out), [0x32, 0x31, 0x2e, 0x35, 0x20, 0xb0, 0x43]);
});

test("encodeText falls back to deterministic '?' when char is not encodable", () => {
  const out = Buffer.from(encodeText("ok λ", { codePage: "cp437" }));
  assert.equal(out.includes(Buffer.from("ok ?", "ascii")), true);
});

test("encodeTextDetailed provides replacement metadata while encodeText stays byte-only", () => {
  const metadata = encodeTextDetailed("“A” — λ ", { codePage: "cp437" });

  assert.equal(typeof encodeTextDetailed, "function");
  assert.equal(ArrayBuffer.isView(metadata.bytes), true);
  assert.deepEqual(Array.from(metadata.bytes), Array.from(Buffer.from('"A" - ? ', "ascii")));
  assert.deepEqual(metadata.replacements, [
    { input: "“", output: '"', kind: "normalized" },
    { input: "”", output: '"', kind: "normalized" },
    { input: "—", output: "-", kind: "normalized" },
    { input: "λ", output: "?", kind: "fallback" },
    { input: "\u00a0", output: " ", kind: "normalized" }
  ]);

  const bytesOnly = encodeText("“A” — λ ", { codePage: "cp437" });
  assert.equal(bytesOnly instanceof Uint8Array, true);
  assert.deepEqual(Array.from(bytesOnly), Array.from(metadata.bytes));
});

test("text-transcoder does not expose __test even when POSPRINT_EXPOSE_TEST_HOOKS is set", () => {
  const previousValue = process.env.POSPRINT_EXPOSE_TEST_HOOKS;

  try {
    process.env.POSPRINT_EXPOSE_TEST_HOOKS = "1";
    const transcoder = reloadTextTranscoder();
    assert.equal(Object.hasOwn(transcoder, "__test"), false);
  } finally {
    if (previousValue == null) {
      delete process.env.POSPRINT_EXPOSE_TEST_HOOKS;
    } else {
      process.env.POSPRINT_EXPOSE_TEST_HOOKS = previousValue;
    }
  }
});

test("resolveCodePage throws for unknown page", () => {
  assert.throws(() => resolveCodePage("cp9999"), /Unsupported code page/i);
});
