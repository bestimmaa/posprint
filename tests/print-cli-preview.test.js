"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { main, formatHelp } = require("../src/print-cli");

test("formatHelp includes --preview", () => {
  assert.equal(formatHelp().includes("--preview"), true);
});

test("main --preview logs a text preview and never prints", async () => {
  const logs = [];
  const result = await main(["--markdown=# Hi\n\nPreis 5 €", "--preview", "--chars-per-line=20"], {
    log: (message) => logs.push(String(message)),
    isTTY: false,
    platform: () => "freebsd",
    listPrinters: async () => {
      throw new Error("should not list printers in preview mode");
    },
    printRaw: async () => {
      throw new Error("should not print in preview mode");
    },
    printRawToPrinterUri: async () => {
      throw new Error("should not print in preview mode");
    }
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.printerName, null);
  assert.equal(typeof result.payloadLength, "number");
  assert.equal(logs.length, 1);
  assert.equal(logs[0], result.preview);
  assert.equal(logs[0].split("\n")[0], `+${"-".repeat(20)}+`);
  assert.equal(logs[0].includes("|        H i         |"), true);
  assert.equal(logs[0].includes("|Preis 5 €           |"), true);
  assert.equal(logs[0].includes("\x1b["), false);
});

test("main --preview enables ANSI styling on a TTY and forwards charsPerLine", async () => {
  let received = null;
  const previousNoColor = process.env.NO_COLOR;
  delete process.env.NO_COLOR;

  try {
    await main(["--markdown=hi", "--preview", "--chars-per-line=30"], {
      log: () => {},
      isTTY: true,
      previewEscpos: (bytes, options) => {
        received = { length: bytes.length, options };
        return "preview";
      }
    });
  } finally {
    if (previousNoColor !== undefined) {
      process.env.NO_COLOR = previousNoColor;
    }
  }

  assert.equal(received.length > 0, true);
  assert.deepEqual(received.options, { charsPerLine: 30, ansi: true });
});

test("main --preview honors NO_COLOR on a TTY", async () => {
  let received = null;
  const previousNoColor = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";

  try {
    await main(["--markdown=hi", "--preview"], {
      log: () => {},
      isTTY: true,
      previewEscpos: (bytes, options) => {
        received = options;
        return "preview";
      }
    });
  } finally {
    if (previousNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previousNoColor;
    }
  }

  assert.deepEqual(received, { charsPerLine: 42, ansi: false });
});
