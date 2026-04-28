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

async function printRawToLinuxPrinter(printerName, data, { spawn = spawnProcess } = {}) {
  if (!Buffer.isBuffer(data)) {
    throw new TypeError("data must be a Buffer");
  }

  try {
    await runCommand("lp", ["-d", printerName, "-o", "raw"], { input: data, spawn });
    return { command: "lp", printerName };
  } catch (error) {
    if (!isCommandMissing(error)) {
      throw error;
    }
  }

  await runCommand("lpr", ["-P", printerName, "-o", "raw"], { input: data, spawn });
  return { command: "lpr", printerName };
}

module.exports = {
  parseLpstatPrinters,
  listPrintersLinux,
  printRawToLinuxPrinter
};
