"use strict";

const TEXT_ENCODER = new TextEncoder();

function concat(buffers) {
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }

  return out;
}

function byte(...values) {
  return Uint8Array.from(values);
}

function text(value) {
  return TEXT_ENCODER.encode(value);
}

function init() {
  return byte(0x1b, 0x40);
}

function setInternationalCharset(value = 0) {
  const n = Math.max(0, Math.min(15, Number(value) || 0));
  return byte(0x1b, 0x52, n);
}

function setCodePage(value = 0) {
  const n = Math.max(0, Math.min(255, Number(value) || 0));
  return byte(0x1b, 0x74, n);
}

function align(mode) {
  const map = { left: 0, center: 1, right: 2 };
  const n = map[mode] ?? 0;
  return byte(0x1b, 0x61, n);
}

function bold(enabled) {
  return byte(0x1b, 0x45, enabled ? 1 : 0);
}

function size(width = 0, height = 0) {
  const w = Math.max(0, Math.min(7, width));
  const h = Math.max(0, Math.min(7, height));
  return byte(0x1d, 0x21, (w << 4) | h);
}

function line(value = "") {
  return concat([text(value), byte(0x0a)]);
}

function feed(lines = 1) {
  const n = Math.max(0, Math.min(255, lines));
  return byte(0x1b, 0x64, n);
}

function cut(partial = true) {
  return byte(0x1d, 0x56, partial ? 1 : 0);
}

function pulseDrawer(pin = 0, onTime = 80, offTime = 160) {
  const m = pin === 1 ? 1 : 0;
  const t1 = Math.max(0, Math.min(255, onTime));
  const t2 = Math.max(0, Math.min(255, offTime));
  return byte(0x1b, 0x70, m, t1, t2);
}

function rasterImage({ width, height, data }) {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("Invalid raster width");
  }

  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("Invalid raster height");
  }

  const bytesPerRow = Math.ceil(width / 8);
  const expectedLength = bytesPerRow * height;
  const payload = data instanceof Uint8Array ? data : Uint8Array.from(data || []);

  if (payload.length !== expectedLength) {
    throw new Error("Invalid raster payload length");
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  return concat([byte(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH), payload]);
}

function qrCode({ payload, size = 6, ec = "M" }) {
  const data = text(String(payload || ""));
  if (data.length === 0) {
    throw new Error("QR payload must not be empty");
  }

  const moduleSize = Number(size);
  if (!Number.isInteger(moduleSize) || moduleSize < 1 || moduleSize > 16) {
    throw new Error("QR size must be an integer between 1 and 16");
  }

  const ecNormalized = String(ec || "").toUpperCase();
  const ecMap = { L: 48, M: 49, Q: 50, H: 51 };
  const ecByte = ecMap[ecNormalized];
  if (ecByte == null) {
    throw new Error("QR ec must be one of L, M, Q, H");
  }

  const storeLen = data.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;

  return concat([
    byte(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    byte(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize),
    byte(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ecByte),
    concat([byte(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30), data]),
    byte(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)
  ]);
}

function demoReceipt() {
  return concat([
    init(),
    align("center"),
    bold(true),
    size(1, 1),
    line("EPSON TM-T88V TEST"),
    size(0, 0),
    bold(false),
    line(""),
    line(new Date().toISOString()),
    line(""),
    align("left"),
    line("1 x Espresso           2.50"),
    line("1 x Croissant          3.00"),
    line("------------------------------"),
    bold(true),
    line("TOTAL                  5.50"),
    bold(false),
    line(""),
    align("center"),
    line("Thank you!"),
    feed(4),
    cut(true)
  ]);
}

module.exports = {
  concat,
  text,
  init,
  setInternationalCharset,
  setCodePage,
  align,
  bold,
  size,
  line,
  feed,
  cut,
  pulseDrawer,
  rasterImage,
  qrCode,
  demoReceipt
};
