"use strict";

const { resolveCodePageById } = require("./text-transcoder");

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;
const DLE = 0x10;
const LF = 0x0a;
const CR = 0x0d;
const HT = 0x09;
const FF = 0x0c;

// Approximate Font A glyph width on the TM-T88V (dots per character column).
const DOTS_PER_CHAR = 12;

const ANSI = {
  bold: ["\x1b[1m", "\x1b[22m"],
  italic: ["\x1b[3m", "\x1b[23m"],
  underline: ["\x1b[4m", "\x1b[24m"]
};

// ESC commands with a fixed number of parameter bytes (after ESC + command byte).
const ESC_FIXED_PARAMS = {
  0x0c: 0, // ESC FF   print data in page mode
  0x20: 1, // ESC SP   character spacing
  0x21: 1, // ESC !    print mode
  0x24: 2, // ESC $    absolute position
  0x25: 1, // ESC %    user-defined charset
  0x2d: 1, // ESC -    underline
  0x32: 0, // ESC 2    default line spacing
  0x33: 1, // ESC 3    line spacing
  0x34: 0, // ESC 4    italic on (builder)
  0x35: 0, // ESC 5    italic off (builder)
  0x3c: 0, // ESC <    return home
  0x3d: 1, // ESC =    select peripheral
  0x3f: 1, // ESC ?    cancel user-defined char
  0x40: 0, // ESC @    initialize
  0x44: -1, // ESC D   tab positions (NUL-terminated)
  0x45: 1, // ESC E    emphasis
  0x47: 1, // ESC G    double-strike
  0x4a: 1, // ESC J    feed n dots
  0x4b: 1, // ESC K    reverse feed dots
  0x4c: 0, // ESC L    page mode
  0x4d: 1, // ESC M    font
  0x52: 1, // ESC R    international charset
  0x53: 0, // ESC S    standard mode
  0x54: 1, // ESC T    page mode direction
  0x55: 1, // ESC U    unidirectional
  0x56: 1, // ESC V    rotation
  0x57: 8, // ESC W    page mode area
  0x5c: 2, // ESC \    relative position
  0x61: 1, // ESC a    justification
  0x64: 1, // ESC d    feed n lines
  0x65: 1, // ESC e    reverse feed lines
  0x69: 0, // ESC i    full cut (legacy)
  0x6d: 0, // ESC m    partial cut (legacy)
  0x70: 3, // ESC p    pulse drawer
  0x72: 1, // ESC r    color
  0x74: 1, // ESC t    code page
  0x75: 1, // ESC u    peripheral status
  0x76: 0, // ESC v    paper status
  0x7b: 1 // ESC {    upside-down
};

// GS commands with a fixed number of parameter bytes (after GS + command byte).
const GS_FIXED_PARAMS = {
  0x21: 1, // GS !     character size
  0x24: 2, // GS $     absolute vertical position (page mode)
  0x2f: 1, // GS /     print downloaded bit image
  0x3a: 0, // GS :     macro definition
  0x42: 1, // GS B     reverse printing
  0x48: 1, // GS H     HRI position
  0x49: 1, // GS I     printer id
  0x4c: 2, // GS L     left margin
  0x50: 2, // GS P     motion units
  0x57: 2, // GS W     print area width
  0x5c: 2, // GS \     relative vertical position
  0x5e: 3, // GS ^     execute macro
  0x61: 1, // GS a     ASB
  0x62: 1, // GS b     smoothing
  0x66: 1, // GS f     HRI font
  0x68: 1, // GS h     barcode height
  0x72: 1, // GS r     status
  0x77: 1 // GS w     barcode width
};

// FS commands with a fixed number of parameter bytes (after FS + command byte).
const FS_FIXED_PARAMS = {
  0x21: 1, // FS !
  0x26: 0, // FS &
  0x2d: 1, // FS -
  0x2e: 0, // FS .
  0x43: 1, // FS C
  0x53: 2, // FS S
  0x57: 1, // FS W
  0x70: 2 // FS p     print NV bit image
};

function stateDefaults() {
  return {
    align: "left",
    bold: false,
    italic: false,
    underline: false,
    widthMul: 1,
    heightMul: 1,
    codePageId: 0,
    leftMarginDots: 0,
    printAreaDots: null
  };
}

function truncate(value, width) {
  const chars = Array.from(value);
  if (chars.length <= width) {
    return value;
  }

  if (width <= 1) {
    return chars.slice(0, width).join("");
  }

  return `${chars.slice(0, width - 1).join("")}…`;
}

function createRenderer({ charsPerLine, ansi }) {
  const rows = [];
  const state = stateDefaults();
  let cells = [];
  let lineAlign = null;
  let lastQrPayload = null;

  function layout() {
    const margin = Math.min(charsPerLine - 1, Math.max(0, Math.round(state.leftMarginDots / DOTS_PER_CHAR)));
    let area = charsPerLine - margin;

    if (state.printAreaDots != null && state.printAreaDots > 0) {
      area = Math.max(1, Math.min(area, Math.floor(state.printAreaDots / DOTS_PER_CHAR)));
    }

    return { margin, area };
  }

  function styleKey(cell) {
    return `${cell.bold ? 1 : 0}${cell.italic ? 1 : 0}${cell.underline ? 1 : 0}`;
  }

  function renderCells(list) {
    if (!ansi) {
      return list.map((cell) => cell.ch).join("");
    }

    let out = "";
    let current = "000";

    for (const cell of list) {
      const key = styleKey(cell);
      if (key !== current) {
        if (current !== "000") {
          out += "\x1b[0m";
        }
        if (cell.bold) out += ANSI.bold[0];
        if (cell.italic) out += ANSI.italic[0];
        if (cell.underline) out += ANSI.underline[0];
        current = key;
      }
      out += cell.ch;
    }

    if (current !== "000") {
      out += "\x1b[0m";
    }

    return out;
  }

  function pushRow(content, visibleWidth, alignMode) {
    const { margin, area } = layout();
    const free = Math.max(0, area - visibleWidth);
    let left = 0;

    if (alignMode === "center") {
      left = Math.floor(free / 2);
    } else if (alignMode === "right") {
      left = free;
    }

    const right = Math.max(0, charsPerLine - margin - left - visibleWidth);
    rows.push({ kind: "text", text: `${" ".repeat(margin + left)}${content}${" ".repeat(right)}` });
  }

  function flushLine() {
    pushRow(renderCells(cells), cells.length, lineAlign || state.align);
    cells = [];
    lineAlign = null;
  }

  function flushIfPending() {
    if (cells.length) {
      flushLine();
    }
  }

  function pushPlaceholder(label) {
    flushIfPending();
    const { area } = layout();
    const value = truncate(label, area);
    pushRow(value, Array.from(value).length, state.align);
  }

  function addChar(ch) {
    const { area } = layout();
    const width = Math.max(1, state.widthMul);

    if (cells.length && cells.length + width > area) {
      flushLine();
    }

    if (!cells.length) {
      lineAlign = state.align;
    }

    const style = { bold: state.bold, italic: state.italic, underline: state.underline };
    cells.push({ ch, ...style });

    for (let i = 1; i < width; i += 1) {
      cells.push({ ch: " ", ...style });
    }
  }

  function decodeByte(value) {
    const page = resolveCodePageById(state.codePageId);
    if (page) {
      return page.decodeByte(value);
    }

    return value <= 0x7f ? String.fromCharCode(value) : "?";
  }

  return {
    state,
    rows,
    addByte(value) {
      addChar(decodeByte(value));
    },
    tab() {
      const next = (Math.floor(cells.length / 8) + 1) * 8;
      while (cells.length < next) {
        addChar(" ");
      }
    },
    lineFeed() {
      flushLine();
    },
    feedLines(n) {
      if (n <= 0) {
        flushIfPending();
        return;
      }
      for (let i = 0; i < n; i += 1) {
        flushLine();
      }
    },
    flush: flushIfPending,
    reset() {
      flushIfPending();
      Object.assign(state, stateDefaults());
    },
    image(widthDots, heightDots) {
      pushPlaceholder(`[image ${widthDots}x${heightDots}]`);
    },
    storeQr(payload) {
      lastQrPayload = payload;
    },
    printQr() {
      pushPlaceholder(`[QR: ${lastQrPayload == null ? "" : lastQrPayload}]`);
    },
    barcode(data) {
      pushPlaceholder(`[barcode: ${data}]`);
    },
    cut(partial) {
      flushIfPending();
      rows.push({ kind: "cut", partial });
    },
    drawer() {
      pushPlaceholder("[drawer]");
    }
  };
}

function formatCutLine(width, partial) {
  const label = partial ? " ✂ cut " : " ✂ full cut ";
  const labelWidth = Array.from(label).length;
  if (labelWidth >= width) {
    return truncate(label.trim(), width).padEnd(width, " ");
  }

  const leftWidth = Math.floor((width - labelWidth) / 2);
  const rightWidth = width - labelWidth - leftWidth;
  // Alternate "- " so that the characters touching the label are always dashes.
  const dashes = (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "-" : " ")).join("");
  const left = Array.from(dashes(leftWidth)).reverse().join("");

  return `${left}${label}${dashes(rightWidth)}`;
}

function asciiLatin1(bytes, start, end) {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function decodeUtf8(bytes, start, end) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start, end));
  } catch {
    return asciiLatin1(bytes, start, end);
  }
}

// Returns the number of bytes consumed starting at `i` (which points at ESC).
function handleEsc(bytes, i, r) {
  const cmd = bytes[i + 1];
  if (cmd == null) {
    return bytes.length - i;
  }

  const p = (k) => bytes[i + 2 + k] ?? 0;
  const s = r.state;

  switch (cmd) {
    case 0x40:
      r.reset();
      return 2;
    case 0x21: {
      const n = p(0);
      s.bold = Boolean(n & 0x08);
      s.heightMul = n & 0x10 ? 2 : 1;
      s.widthMul = n & 0x20 ? 2 : 1;
      s.underline = Boolean(n & 0x80);
      return 3;
    }
    case 0x2d:
      s.underline = (p(0) & 0x03) !== 0;
      return 3;
    case 0x45:
    case 0x47:
      s.bold = Boolean(p(0) & 0x01);
      return 3;
    case 0x34:
      s.italic = true;
      return 2;
    case 0x35:
      s.italic = false;
      return 2;
    case 0x61: {
      const n = p(0);
      s.align = n === 1 || n === 0x31 ? "center" : n === 2 || n === 0x32 ? "right" : "left";
      return 3;
    }
    case 0x74:
      s.codePageId = p(0);
      return 3;
    case 0x64:
      r.feedLines(p(0));
      return 3;
    case 0x4a:
      r.flush();
      return 3;
    case 0x69:
      r.cut(false);
      return 2;
    case 0x6d:
      r.cut(true);
      return 2;
    case 0x70:
      r.drawer();
      return 5;
    case 0x44: {
      // Tab positions: up to 32 bytes terminated by NUL.
      let j = i + 2;
      while (j < bytes.length && bytes[j] !== 0x00 && j - (i + 2) < 32) {
        j += 1;
      }
      return j - i + (bytes[j] === 0x00 ? 1 : 0);
    }
    case 0x2a: {
      // ESC * m nL nH d1...dk (bit image); k = n or 3n depending on density.
      const m = p(0);
      const n = p(1) | (p(2) << 8);
      const k = m === 32 || m === 33 ? n * 3 : n;
      r.image(n, m === 32 || m === 33 ? 24 : 8);
      return 5 + k;
    }
    default: {
      const params = ESC_FIXED_PARAMS[cmd];
      return 2 + (params == null || params < 0 ? 0 : params);
    }
  }
}

function handleQr(bytes, i, len, r) {
  // GS ( k pL pH cn fn [params]
  const cn = bytes[i + 5];
  const fn = bytes[i + 6];

  if (cn !== 0x31) {
    return;
  }

  if (fn === 0x50) {
    const dataStart = i + 8;
    const dataEnd = i + 5 + len;
    r.storeQr(decodeUtf8(bytes, dataStart, Math.min(dataEnd, bytes.length)));
  } else if (fn === 0x51) {
    r.printQr();
  }
}

// Returns the number of bytes consumed starting at `i` (which points at GS).
function handleGs(bytes, i, r) {
  const cmd = bytes[i + 1];
  if (cmd == null) {
    return bytes.length - i;
  }

  const p = (k) => bytes[i + 2 + k] ?? 0;
  const s = r.state;

  switch (cmd) {
    case 0x21: {
      const n = p(0);
      s.widthMul = ((n >> 4) & 0x07) + 1;
      s.heightMul = (n & 0x07) + 1;
      return 3;
    }
    case 0x42:
      return 3;
    case 0x4c:
      s.leftMarginDots = p(0) | (p(1) << 8);
      return 4;
    case 0x57:
      s.printAreaDots = p(0) | (p(1) << 8);
      return 4;
    case 0x56: {
      const m = p(0);
      r.cut(m === 1 || m === 0x31 || m === 66 || m === 68 || m === 98 || m === 100 || m === 104);
      return m >= 65 ? 4 : 3;
    }
    case 0x76: {
      // GS v 0 m xL xH yL yH d1...dk
      if (p(0) !== 0x30) {
        return 2;
      }
      const bytesPerRow = p(2) | (p(3) << 8);
      const height = p(4) | (p(5) << 8);
      r.image(bytesPerRow * 8, height);
      return 8 + bytesPerRow * height;
    }
    case 0x2a: {
      // GS * x y d1...d(x*y*8): define downloaded bit image
      return 4 + p(0) * p(1) * 8;
    }
    case 0x28: {
      // GS ( <fn> pL pH ...: length-prefixed family (QR is GS ( k).
      const len = p(1) | (p(2) << 8);
      if (p(0) === 0x6b) {
        handleQr(bytes, i, len, r);
      }
      return 5 + len;
    }
    case 0x38: {
      // GS 8 L p1 p2 p3 p4 ...: 32-bit length-prefixed family
      const len = p(1) + p(2) * 0x100 + p(3) * 0x10000 + p(4) * 0x1000000;
      return 7 + len;
    }
    case 0x6b: {
      // GS k barcode
      const m = p(0);
      if (m <= 6) {
        let j = i + 3;
        while (j < bytes.length && bytes[j] !== 0x00) {
          j += 1;
        }
        r.barcode(asciiLatin1(bytes, i + 3, j));
        return j - i + (j < bytes.length ? 1 : 0);
      }
      const n = p(1);
      r.barcode(asciiLatin1(bytes, i + 4, i + 4 + n));
      return 4 + n;
    }
    default: {
      const params = GS_FIXED_PARAMS[cmd];
      return 2 + (params == null ? 0 : params);
    }
  }
}

function handleFs(bytes, i) {
  const cmd = bytes[i + 1];
  if (cmd == null) {
    return bytes.length - i;
  }

  const params = FS_FIXED_PARAMS[cmd];
  return 2 + (params == null ? 0 : params);
}

function handleDle(bytes, i) {
  const cmd = bytes[i + 1];
  if (cmd === 0x04 || cmd === 0x05) {
    return 3;
  }
  if (cmd === 0x14) {
    return 5;
  }
  return 1;
}

function normalizeBytes(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }

  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes);
  }

  if (bytes && typeof bytes.length === "number") {
    return Uint8Array.from(bytes);
  }

  throw new TypeError("previewEscpos expects a Uint8Array, Buffer, or byte array");
}

function frame(rows, charsPerLine) {
  const border = `+${"-".repeat(charsPerLine)}+`;
  const out = [border];

  for (const row of rows) {
    if (row.kind === "cut") {
      out.push(`|${formatCutLine(charsPerLine, row.partial)}|`);
    } else {
      out.push(`|${row.text}|`);
    }
  }

  out.push(border);
  return out.join("\n");
}

/**
 * Render a plain-text approximation of an ESC/POS payload.
 *
 * @param {Uint8Array|Buffer|number[]} bytes ESC/POS payload
 * @param {{ charsPerLine?: number, ansi?: boolean }} [options]
 * @returns {string}
 */
function previewEscpos(bytes, options = {}) {
  const data = normalizeBytes(bytes);
  const charsPerLine = Number.isInteger(options.charsPerLine) && options.charsPerLine > 0 ? options.charsPerLine : 42;
  const r = createRenderer({ charsPerLine, ansi: Boolean(options.ansi) });
  let i = 0;

  while (i < data.length) {
    const b = data[i];
    let consumed = 1;

    if (b === ESC) {
      consumed = handleEsc(data, i, r);
    } else if (b === GS) {
      consumed = handleGs(data, i, r);
    } else if (b === FS) {
      consumed = handleFs(data, i);
    } else if (b === DLE) {
      consumed = handleDle(data, i);
    } else if (b === LF) {
      r.lineFeed();
    } else if (b === HT) {
      r.tab();
    } else if (b === FF) {
      r.flush();
    } else if (b === CR || b < 0x20 || b === 0x7f) {
      // Ignore other control bytes.
    } else {
      r.addByte(b);
    }

    i += Math.max(1, consumed);
  }

  r.flush();
  return frame(r.rows, charsPerLine);
}

module.exports = { previewEscpos };
