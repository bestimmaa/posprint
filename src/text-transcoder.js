"use strict";

const CP850_EXTENDED = new Map([
  ["°", 0xf8],
  ["ä", 0x84],
  ["ö", 0x94],
  ["ü", 0x81],
  ["Ä", 0x8e],
  ["Ö", 0x99],
  ["Ü", 0x9a],
  ["ß", 0xe1],
  ["é", 0x82],
  ["è", 0x8a],
  ["à", 0x85],
  ["ñ", 0xa4],
  ["Ñ", 0xa5]
]);

const CODE_PAGES = {
  cp850: {
    name: "cp850",
    escposId: 2,
    encodeChar(char) {
      const cp = char.codePointAt(0);
      if (cp <= 0x7f) {
        return cp;
      }

      return CP850_EXTENDED.get(char) ?? null;
    }
  }
};

function normalizeFallback(value) {
  return String(value || "")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[\u202F\u00A0]*°/g, " deg")
    .replace(/[\u202F\u00A0]/g, " ");
}

function resolveCodePage(name = "cp850") {
  const normalized = String(name || "").trim().toLowerCase();
  const page = CODE_PAGES[normalized];

  if (!page) {
    throw new Error(`Unsupported code page: ${name}. Supported: ${Object.keys(CODE_PAGES).join(", ")}`);
  }

  return page;
}

function getSupportedCodePages() {
  return Object.values(CODE_PAGES).map(({ name, escposId }) => ({ name, escposId }));
}

function encodeText(input, { codePage = "cp850" } = {}) {
  const page = resolveCodePage(codePage);
  const bytes = [];

  for (const char of String(input || "")) {
    const direct = page.encodeChar(char);
    if (direct != null) {
      bytes.push(direct);
      continue;
    }

    const fallback = normalizeFallback(char);
    if (!fallback) {
      continue;
    }

    for (const fallbackChar of fallback) {
      const encoded = page.encodeChar(fallbackChar);
      bytes.push(encoded != null ? encoded : 0x3f);
    }
  }

  return Uint8Array.from(bytes);
}

module.exports = {
  resolveCodePage,
  getSupportedCodePages,
  encodeText
};
