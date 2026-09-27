"use strict";

const { resolveCodePageById } = require("./text-transcoder");

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const HT = 0x09;

// Approximate Font A glyph width on the TM-T88V (dots per character column).
const DOTS_PER_CHAR = 12;
const ALIGNMENTS = ["left", "center", "right"];
const UTF8 = new TextDecoder("utf-8");

function truncate(value, width) {
  const chars = Array.from(value);
  if (chars.length <= width) {
    return value;
  }

  return width <= 1 ? chars.slice(0, width).join("") : `${chars.slice(0, width - 1).join("")}…`;
}

function formatCutLine(width, partial) {
  const label = partial ? " ✂ cut " : " ✂ full cut ";
  const labelWidth = Array.from(label).length;
  if (labelWidth >= width) {
    return truncate(label.trim(), width).padEnd(width, " ");
  }

  const leftWidth = Math.floor((width - labelWidth) / 2);
  // Alternate "- " so that the characters touching the label are always dashes.
  const dashes = (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "-" : " "));

  return `${dashes(leftWidth).reverse().join("")}${label}${dashes(width - labelWidth - leftWidth).join("")}`;
}

function renderCells(cells, ansi) {
  if (!ansi) {
    return cells.map((cell) => cell.ch).join("");
  }

  let out = "";
  let styled = false;
  let previous = null;

  for (const cell of cells) {
    const key = `${cell.bold}${cell.italic}`;
    if (key !== previous) {
      if (styled) {
        out += "\x1b[0m";
      }
      out += `${cell.bold ? "\x1b[1m" : ""}${cell.italic ? "\x1b[3m" : ""}`;
      styled = cell.bold || cell.italic;
      previous = key;
    }
    out += cell.ch;
  }

  return styled ? `${out}\x1b[0m` : out;
}

function createRenderer(charsPerLine, ansi) {
  const rows = [];
  const state = {};
  let cells = [];
  let lineAlign = "left";
  let qrPayload = "";

  function layout() {
    const margin = Math.min(charsPerLine - 1, Math.round(state.leftMarginDots / DOTS_PER_CHAR));
    let area = charsPerLine - margin;

    if (state.printAreaDots > 0) {
      area = Math.max(1, Math.min(area, Math.floor(state.printAreaDots / DOTS_PER_CHAR)));
    }

    return { margin, area };
  }

  function pushRow(content, width, alignMode) {
    const { margin, area } = layout();
    const free = Math.max(0, area - width);
    const left = alignMode === "center" ? Math.floor(free / 2) : alignMode === "right" ? free : 0;
    const right = Math.max(0, charsPerLine - margin - left - width);
    rows.push(`${" ".repeat(margin + left)}${content}${" ".repeat(right)}`);
  }

  function flushLine() {
    pushRow(renderCells(cells, ansi), cells.length, cells.length ? lineAlign : state.align);
    cells = [];
  }

  function flush() {
    if (cells.length) {
      flushLine();
    }
  }

  function addChar(ch) {
    const { area } = layout();
    const width = Math.min(area, state.widthMul);

    if (cells.length + width > area) {
      flushLine();
    }

    if (!cells.length) {
      lineAlign = state.align;
    }

    for (let i = 0; i < width; i += 1) {
      cells.push({ ch: i === 0 ? ch : " ", bold: state.bold, italic: state.italic });
    }
  }

  function placeholder(label) {
    flush();
    const value = truncate(label, layout().area);
    pushRow(value, Array.from(value).length, state.align);
  }

  function reset() {
    flush();
    Object.assign(state, {
      align: "left",
      bold: false,
      italic: false,
      widthMul: 1,
      codePageId: 0,
      leftMarginDots: 0,
      printAreaDots: 0
    });
  }

  reset();

  return {
    state,
    rows,
    reset,
    flush,
    flushLine,
    placeholder,
    addByte(value) {
      const page = resolveCodePageById(state.codePageId);
      addChar(page ? page.decodeByte(value) : value <= 0x7f ? String.fromCharCode(value) : "?");
    },
    tab() {
      const columns = 8 - (cells.length % 8);
      for (let i = 0; i < Math.ceil(columns / state.widthMul); i += 1) {
        addChar(" ");
      }
    },
    feedLines(n) {
      // Pending text prints as the first fed line, like LF.
      for (let i = 0; i < n; i += 1) {
        flushLine();
      }
      flush();
    },
    cut(partial) {
      flush();
      rows.push({ cut: true, partial });
    },
    storeQr(payload) {
      qrPayload = payload;
    },
    printQr() {
      placeholder(`[QR: ${qrPayload}]`);
    }
  };
}

// Interprets the command at `i` and returns the number of bytes it spans.
// Only commands emitted by escpos-builder are understood; other ESC/GS
// commands skip the two-byte prefix and let their parameters fall through.
function handleCommand(data, i, r) {
  const p = (k) => data[i + 2 + k] ?? 0;
  const s = r.state;

  if (data[i] === ESC) {
    switch (data[i + 1]) {
      case 0x40: // ESC @ initialize
        r.reset();
        return 2;
      case 0x45: // ESC E bold
        s.bold = Boolean(p(0) & 0x01);
        return 3;
      case 0x34: // ESC 4 italic on
      case 0x35: // ESC 5 italic off
        s.italic = data[i + 1] === 0x34;
        return 2;
      case 0x61: // ESC a justification
        s.align = ALIGNMENTS[p(0)] || "left";
        return 3;
      case 0x74: // ESC t code page
        s.codePageId = p(0);
        return 3;
      case 0x64: // ESC d feed n lines
        r.feedLines(p(0));
        return 3;
      case 0x70: // ESC p drawer pulse
        r.placeholder("[drawer]");
        return 5;
      case 0x20: // ESC SP character spacing
      case 0x33: // ESC 3 line spacing
      case 0x4d: // ESC M font
      case 0x52: // ESC R international charset
        return 3;
      default:
        return 2;
    }
  }

  switch (data[i + 1]) {
    case 0x21: // GS ! character size
      s.widthMul = ((p(0) >> 4) & 0x07) + 1;
      return 3;
    case 0x4c: // GS L left margin
      s.leftMarginDots = p(0) | (p(1) << 8);
      return 4;
    case 0x57: // GS W print area width
      s.printAreaDots = p(0) | (p(1) << 8);
      return 4;
    case 0x56: // GS V cut
      r.cut(p(0) === 1);
      return 3;
    case 0x76: {
      // GS v 0 m xL xH yL yH d1...dk raster image
      if (p(0) !== 0x30) {
        return 2;
      }
      const bytesPerRow = p(2) | (p(3) << 8);
      const height = p(4) | (p(5) << 8);
      r.placeholder(`[image ${bytesPerRow * 8}x${height}]`);
      return 8 + bytesPerRow * height;
    }
    case 0x28: {
      // GS ( fn pL pH ... length-prefixed family; QR is GS ( k with cn = 49.
      const len = p(1) | (p(2) << 8);
      if (p(0) === 0x6b && p(3) === 0x31 && p(4) === 0x50) {
        r.storeQr(UTF8.decode(data.subarray(i + 8, i + 5 + len)));
      } else if (p(0) === 0x6b && p(3) === 0x31 && p(4) === 0x51) {
        r.printQr();
      }
      return 5 + len;
    }
    default:
      return 2;
  }
}

/**
 * Render a plain-text approximation of an ESC/POS payload.
 *
 * @param {Uint8Array|Buffer|number[]} bytes ESC/POS payload
 * @param {{ charsPerLine?: number, ansi?: boolean }} [options]
 * @returns {string}
 */
function previewEscpos(bytes, options = {}) {
  if (bytes == null || typeof bytes.length !== "number") {
    throw new TypeError("previewEscpos expects a Uint8Array, Buffer, or byte array");
  }

  const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const charsPerLine = Number.isInteger(options.charsPerLine) && options.charsPerLine > 0 ? options.charsPerLine : 42;
  const r = createRenderer(charsPerLine, Boolean(options.ansi));
  let i = 0;

  while (i < data.length) {
    const b = data[i];

    if (b === ESC || b === GS) {
      i += handleCommand(data, i, r);
      continue;
    }

    if (b === LF) {
      r.flushLine();
    } else if (b === HT) {
      r.tab();
    } else if (b >= 0x20 && b !== 0x7f) {
      r.addByte(b);
    }
    i += 1;
  }

  r.flush();

  const border = `+${"-".repeat(charsPerLine)}+`;
  const lines = r.rows.map((row) => `|${row.cut ? formatCutLine(charsPerLine, row.partial) : row}|`);
  return [border, ...lines, border].join("\n");
}

module.exports = { previewEscpos };
