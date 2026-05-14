"use strict";

const { spawn: spawnProcess } = require("node:child_process");

function parseLpstatPrinters(stdout) {
  return String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);
}

function runCommand(command, args, { input, spawn = spawnProcess } = {}) {
  return new Promise((resolve, reject) => {
    let child;

    try {
      child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const message = stderr || stdout || `${command} exited with ${code}`;
        reject(new Error(message));
        return;
      }

      resolve({ stdout, stderr });
    });

    if (input && input.length > 0) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function listPrintersLinux({ spawn = spawnProcess } = {}) {
  const { stdout } = await runCommand("lpstat", ["-a"], { spawn });
  return parseLpstatPrinters(stdout);
}

function isCommandMissing(error) {
  return Boolean(
    error && (error.code === "ENOENT" || /\bENOENT\b/i.test(String(error.message || "")))
  );
}

function parsePrinterUri(printerUri) {
  let uri;

  try {
    uri = new URL(printerUri);
  } catch {
    throw new Error("Invalid printer URI. Use ipp://host:port/printers/queue.");
  }

  if (uri.protocol !== "ipp:" && uri.protocol !== "ipps:") {
    throw new Error("Unsupported printer URI scheme. Use ipp:// or ipps://.");
  }

  const match = uri.pathname.match(/^\/printers\/([^/]+)$/);

  if (!match) {
    throw new Error("Unsupported printer URI path. Expected /printers/<queue>.");
  }

  return {
    hostPort: uri.port ? `${uri.hostname}:${uri.port}` : uri.hostname,
    queueName: decodeURIComponent(match[1])
  };
}

async function printRawToLinuxPrinter(printerName, data, { spawn = spawnProcess } = {}) {
  if (!Buffer.isBuffer(data)) {
    throw new TypeError("data must be a Buffer");
  }

  try {
    await runCommand("lp", ["-d", printerName, "-o", "raw"], { input: data, spawn });
    return { backend: "cups-local", command: "lp", printerName };
  } catch (error) {
    if (!isCommandMissing(error)) {
      throw error;
    }
  }

  await runCommand("lpr", ["-P", printerName, "-o", "raw"], { input: data, spawn });
  return { backend: "cups-local", command: "lpr", printerName };
}

async function printRawToPrinterUri(printerUri, data, { spawn = spawnProcess } = {}) {
  if (!Buffer.isBuffer(data)) {
    throw new TypeError("data must be a Buffer");
  }

  const { hostPort, queueName } = parsePrinterUri(printerUri);
  await runCommand("lp", ["-h", hostPort, "-d", queueName, "-o", "raw"], { input: data, spawn });

  return { command: "lp", printerUri, printerName: queueName };
}

module.exports = {
  parseLpstatPrinters,
  parsePrinterUri,
  listPrintersLinux,
  printRawToLinuxPrinter,
  printRawToPrinterUri
};
