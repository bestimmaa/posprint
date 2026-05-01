"use strict";

const WESTERN_EXTENDED = new Map([
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

const CP858_EXTENDED = new Map([...WESTERN_EXTENDED, ["€", 0xd5]]);

const CP1252_SPECIAL = new Map([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f]
]);

function encodeAsciiAndMap(char, map) {
  const cp = char.codePointAt(0);
  if (cp <= 0x7f) {
    return cp;
  }

  return map.get(char) ?? null;
}

function encodeCp1252(char) {
  const cp = char.codePointAt(0);
  if (cp <= 0x7f) {
    return cp;
  }

  if (cp >= 0xa0 && cp <= 0xff) {
    return cp;
  }

  return CP1252_SPECIAL.get(char) ?? null;
}

const CODE_PAGES = {
  cp437: {
    name: "cp437",
    escposId: 0,
    encodeChar(char) {
      return encodeAsciiAndMap(char, WESTERN_EXTENDED);
    }
  },
  cp850: {
    name: "cp850",
    escposId: 2,
    encodeChar(char) {
      return encodeAsciiAndMap(char, WESTERN_EXTENDED);
    }
  },
  cp858: {
    name: "cp858",
    escposId: 19,
    encodeChar(char) {
      return encodeAsciiAndMap(char, CP858_EXTENDED);
    }
  },
  cp1252: {
    name: "cp1252",
    escposId: 16,
    encodeChar(char) {
      return encodeCp1252(char);
    }
  }
};

function normalizeFallback(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[\u202F\u00A0]*°/g, " deg")
    .replace(/[\u202F\u00A0]/g, " ");
}

function resolveCodePage(name = "cp858") {
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

function encodeText(input, { codePage = "cp858" } = {}) {
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
