"use strict";

const path = require("node:path");
const { readFileSync } = require("node:fs");
const jpeg = require("jpeg-js");
const { PNG } = require("pngjs");

function resolveMarkdownImagePath(src) {
  const clean = String(src || "").trim();
  if (!clean) {
    throw new Error("Missing image path");
  }

  return path.isAbsolute(clean) ? clean : path.resolve(process.cwd(), clean);
}

function assertSupportedExtension(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (!ext || ![".png", ".jpg", ".jpeg"].includes(ext)) {
    throw new Error(`Unsupported image extension: ${ext || "(none)"}`);
  }
  return ext;
}

function decodeImageFromBuffer(buffer, ext) {
  if (ext === ".png") {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  }

  const jpg = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
  return { width: jpg.width, height: jpg.height, data: jpg.data };
}

function resizeRgbaNearest(rgba, width, height, targetWidth, targetHeight) {
  if (targetWidth === width && targetHeight === height) {
    return rgba;
  }

  const out = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(height - 1, Math.floor((y * height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(width - 1, Math.floor((x * width) / targetWidth));
      const srcIndex = (srcY * width + srcX) * 4;
      const dstIndex = (y * targetWidth + x) * 4;
      out[dstIndex] = rgba[srcIndex];
      out[dstIndex + 1] = rgba[srcIndex + 1];
      out[dstIndex + 2] = rgba[srcIndex + 2];
      out[dstIndex + 3] = rgba[srcIndex + 3];
    }
  }

  return out;
}

function packMonochromeThreshold(rgba, width, height, threshold) {
  const bytesPerRow = Math.ceil(width / 8);
  const out = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const a = rgba[i + 3];
      const whiteBlend = (255 - a) / 255;
      const rr = Math.round(r + (255 - r) * whiteBlend);
      const gg = Math.round(g + (255 - g) * whiteBlend);
      const bb = Math.round(b + (255 - b) * whiteBlend);
      const luminance = Math.round(0.299 * rr + 0.587 * gg + 0.114 * bb);

      if (luminance < threshold) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        out[byteIndex] |= 0x80 >> (x % 8);
      }
    }
  }

  return out;
}

function imageFileToRaster({ filePath, charsPerLine, threshold = 128 }) {
  const ext = assertSupportedExtension(filePath);

  let source;
  try {
    source = readFileSync(filePath);
  } catch (error) {
    throw new Error(`Unable to read image: ${error.message}`);
  }

  let decoded;
  try {
    decoded = decodeImageFromBuffer(source, ext);
  } catch (error) {
    throw new Error(`Unable to decode image: ${error.message}`);
  }

  if (!Number.isInteger(decoded.width) || !Number.isInteger(decoded.height) || decoded.width <= 0 || decoded.height <= 0) {
    throw new Error("Invalid image dimensions");
  }

  const printableWidth = Math.max(8, (Number.isInteger(charsPerLine) ? charsPerLine : 42) * 8);
  const scale = decoded.width > printableWidth ? printableWidth / decoded.width : 1;
  const targetWidth = Math.max(1, Math.round(decoded.width * scale));
  const targetHeight = Math.max(1, Math.round(decoded.height * scale));
  const safeThreshold = Math.max(0, Math.min(255, Number(threshold) || 128));

  const resized = resizeRgbaNearest(decoded.data, decoded.width, decoded.height, targetWidth, targetHeight);
  const data = packMonochromeThreshold(resized, targetWidth, targetHeight, safeThreshold);

  return {
    width: targetWidth,
    height: targetHeight,
    data
  };
}

function imageTokenToRaster({ src, charsPerLine, threshold = 128 }) {
  const filePath = resolveMarkdownImagePath(src);
  try {
    return imageFileToRaster({ filePath, charsPerLine, threshold });
  } catch (error) {
    throw new Error(`Image "${src}": ${error.message}`);
  }
}

module.exports = {
  resolveMarkdownImagePath,
  assertSupportedExtension,
  imageFileToRaster,
  imageTokenToRaster
};
