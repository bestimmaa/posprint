"use strict";

const CP437_UPPER_HALF = [
  "Ç", "ü", "é", "â", "ä", "à", "å", "ç", "ê", "ë", "è", "ï", "î", "ì", "Ä", "Å",
  "É", "æ", "Æ", "ô", "ö", "ò", "û", "ù", "ÿ", "Ö", "Ü", "¢", "£", "¥", "₧", "ƒ",
  "á", "í", "ó", "ú", "ñ", "Ñ", "ª", "º", "¿", "⌐", "¬", "½", "¼", "¡", "«", "»",
  "░", "▒", "▓", "│", "┤", "╡", "╢", "╖", "╕", "╣", "║", "╗", "╝", "╜", "╛", "┐",
  "└", "┴", "┬", "├", "─", "┼", "╞", "╟", "╚", "╔", "╩", "╦", "╠", "═", "╬", "╧",
  "╨", "╤", "╥", "╙", "╘", "╒", "╓", "╫", "╪", "┘", "┌", "█", "▄", "▌", "▐", "▀",
  "α", "ß", "Γ", "π", "Σ", "σ", "µ", "τ", "Φ", "Θ", "Ω", "δ", "∞", "φ", "ε", "∩",
  "≡", "±", "≥", "≤", "⌠", "⌡", "÷", "≈", "°", "∙", "·", "√", "ⁿ", "²", "■", "\u00a0"
];

const CP850_UPPER_HALF = [
  "Ç", "ü", "é", "â", "ä", "à", "å", "ç", "ê", "ë", "è", "ï", "î", "ì", "Ä", "Å",
  "É", "æ", "Æ", "ô", "ö", "ò", "û", "ù", "ÿ", "Ö", "Ü", "ø", "£", "Ø", "×", "ƒ",
  "á", "í", "ó", "ú", "ñ", "Ñ", "ª", "º", "¿", "®", "¬", "½", "¼", "¡", "«", "»",
  "░", "▒", "▓", "│", "┤", "Á", "Â", "À", "©", "╣", "║", "╗", "╝", "¢", "¥", "┐",
  "└", "┴", "┬", "├", "─", "┼", "ã", "Ã", "╚", "╔", "╩", "╦", "╠", "═", "╬", "¤",
  "ð", "Ð", "Ê", "Ë", "È", "ı", "Í", "Î", "Ï", "┘", "┌", "█", "▄", "¦", "Ì", "▀",
  "Ó", "ß", "Ô", "Ò", "õ", "Õ", "µ", "þ", "Þ", "Ú", "Û", "Ù", "ý", "Ý", "¯", "´",
  "\u00ad", "±", "‗", "¾", "¶", "§", "÷", "¸", "°", "¨", "·", "¹", "³", "²", "■", "\u00a0"
];

const CP858_UPPER_HALF = [
  "Ç", "ü", "é", "â", "ä", "à", "å", "ç", "ê", "ë", "è", "ï", "î", "ì", "Ä", "Å",
  "É", "æ", "Æ", "ô", "ö", "ò", "û", "ù", "ÿ", "Ö", "Ü", "ø", "£", "Ø", "×", "ƒ",
  "á", "í", "ó", "ú", "ñ", "Ñ", "ª", "º", "¿", "®", "¬", "½", "¼", "¡", "«", "»",
  "░", "▒", "▓", "│", "┤", "Á", "Â", "À", "©", "╣", "║", "╗", "╝", "¢", "¥", "┐",
  "└", "┴", "┬", "├", "─", "┼", "ã", "Ã", "╚", "╔", "╩", "╦", "╠", "═", "╬", "¤",
  "ð", "Ð", "Ê", "Ë", "È", "€", "Í", "Î", "Ï", "┘", "┌", "█", "▄", "¦", "Ì", "▀",
  "Ó", "ß", "Ô", "Ò", "õ", "Õ", "µ", "þ", "Þ", "Ú", "Û", "Ù", "ý", "Ý", "¯", "´",
  "\u00ad", "±", "‗", "¾", "¶", "§", "÷", "¸", "°", "¨", "·", "¹", "³", "²", "■", "\u00a0"
];

const CP1252_UPPER_HALF = [
  "€", "\u0081", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Œ", "\u008d", "Ž", "\u008f",
  "\u0090", "‘", "’", "“", "”", "•", "–", "—", "˜", "™", "š", "›", "œ", "\u009d", "ž", "Ÿ",
  "\u00a0", "¡", "¢", "£", "¤", "¥", "¦", "§", "¨", "©", "ª", "«", "¬", "\u00ad", "®", "¯",
  "°", "±", "²", "³", "´", "µ", "¶", "·", "¸", "¹", "º", "»", "¼", "½", "¾", "¿",
  "À", "Á", "Â", "Ã", "Ä", "Å", "Æ", "Ç", "È", "É", "Ê", "Ë", "Ì", "Í", "Î", "Ï",
  "Ð", "Ñ", "Ò", "Ó", "Ô", "Õ", "Ö", "×", "Ø", "Ù", "Ú", "Û", "Ü", "Ý", "Þ", "ß",
  "à", "á", "â", "ã", "ä", "å", "æ", "ç", "è", "é", "ê", "ë", "ì", "í", "î", "ï",
  "ð", "ñ", "ò", "ó", "ô", "õ", "ö", "÷", "ø", "ù", "ú", "û", "ü", "ý", "þ", "ÿ"
];

const SMART_DOUBLE_QUOTES = new Set(["“", "”"]);
const SMART_SINGLE_QUOTES = new Set(["‘", "’"]);
const UNICODE_DASHES = new Set(["‐", "‑", "‒", "–", "—", "―", "−"]);
const NON_BREAKING_SPACES = new Set(["\u00a0", "\u202f"]);

function buildUpperHalfMap(chars) {
  return new Map(chars.map((char, index) => [char, index + 0x80]));
}

function createCodePage(name, escposId, upperHalf) {
  const upperHalfMap = buildUpperHalfMap(upperHalf);

  return {
    name,
    escposId,
    decodeByte(value) {
      if (value <= 0x7f) {
        return String.fromCharCode(value);
      }

      return upperHalf[value - 0x80] ?? "?";
    },
    encodeChar(char) {
      const cp = char.codePointAt(0);
      if (cp <= 0x7f) {
        return cp;
      }

      return upperHalfMap.get(char) ?? null;
    }
  };
}

const CODE_PAGES = {
  cp437: createCodePage("cp437", 0, CP437_UPPER_HALF),
  cp850: createCodePage("cp850", 2, CP850_UPPER_HALF),
  cp858: createCodePage("cp858", 19, CP858_UPPER_HALF),
  cp1252: createCodePage("cp1252", 16, CP1252_UPPER_HALF)
};

function normalizeException(char) {
  if (SMART_DOUBLE_QUOTES.has(char)) {
    return '"';
  }

  if (SMART_SINGLE_QUOTES.has(char)) {
    return "'";
  }

  if (UNICODE_DASHES.has(char)) {
    return "-";
  }

  if (NON_BREAKING_SPACES.has(char)) {
    return " ";
  }

  return null;
}

function encodeTextWithMetadata(input, { codePage = "cp858" } = {}) {
  const page = resolveCodePage(codePage);
  const bytes = [];
  const replacements = [];

  for (const char of String(input || "")) {
    const normalized = normalizeException(char);
    const source = normalized ?? char;

    if (normalized != null) {
      replacements.push({ input: char, output: normalized, kind: "normalized" });
    }

    for (const candidate of source) {
      const encoded = page.encodeChar(candidate);
      if (encoded != null) {
        bytes.push(encoded);
        continue;
      }

      bytes.push(0x3f);
      replacements.push({ input: char, output: "?", kind: "fallback" });
    }
  }

  return {
    bytes: Uint8Array.from(bytes),
    replacements
  };
}

function resolveCodePage(name = "cp858") {
  const normalized = String(name || "").trim().toLowerCase();
  const page = CODE_PAGES[normalized];

  if (!page) {
    throw new Error(`Unsupported code page: ${name}. Supported: ${Object.keys(CODE_PAGES).join(", ")}`);
  }

  return page;
}

function resolveCodePageById(escposId) {
  return Object.values(CODE_PAGES).find((page) => page.escposId === escposId) || null;
}

function getSupportedCodePages() {
  return Object.values(CODE_PAGES).map(({ name, escposId }) => ({ name, escposId }));
}

function encodeText(input, options) {
  return encodeTextWithMetadata(input, options).bytes;
}

const exported = {
  resolveCodePage,
  resolveCodePageById,
  getSupportedCodePages,
  encodeText,
  encodeTextDetailed: encodeTextWithMetadata
};

module.exports = exported;
