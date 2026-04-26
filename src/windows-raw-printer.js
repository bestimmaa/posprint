"use strict";

const { spawn } = require("child_process");
const { writeFile } = require("fs/promises");
const path = require("path");
const os = require("os");

function powershellEscape(value) {
  return String(value).replace(/'/g, "''");
}

function runPowerShell(script, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("PowerShell command timed out"));
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });

    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`PowerShell exited with ${code}: ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function listPrinters() {
  const script = "$ErrorActionPreference='Stop'; Get-Printer | Select-Object -ExpandProperty Name";
  const { stdout } = await runPowerShell(script);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function printRawToWindowsPrinter(printerName, data) {
  if (!Buffer.isBuffer(data)) {
    throw new TypeError("data must be a Buffer");
  }

  const tmpFile = path.join(os.tmpdir(), `escpos-${Date.now()}.bin`);
  await writeFile(tmpFile, data);

  const pName = powershellEscape(printerName);
  const pPath = powershellEscape(tmpFile);

  const script = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -TypeDefinition @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class RawPrinterHelper {",
    "  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]",
    "  public class DOCINFOA {",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;",
    "  }",
    "  [DllImport(\"winspool.Drv\", EntryPoint=\"OpenPrinterW\", SetLastError=true, CharSet=CharSet.Unicode)]",
    "  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);",
    "  [DllImport(\"winspool.Drv\", SetLastError=true)]",
    "  public static extern bool ClosePrinter(IntPtr hPrinter);",
    "  [DllImport(\"winspool.Drv\", SetLastError=true, CharSet=CharSet.Unicode)]",
    "  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);",
    "  [DllImport(\"winspool.Drv\", SetLastError=true)]",
    "  public static extern bool EndDocPrinter(IntPtr hPrinter);",
    "  [DllImport(\"winspool.Drv\", SetLastError=true)]",
    "  public static extern bool StartPagePrinter(IntPtr hPrinter);",
    "  [DllImport(\"winspool.Drv\", SetLastError=true)]",
    "  public static extern bool EndPagePrinter(IntPtr hPrinter);",
    "  [DllImport(\"winspool.Drv\", SetLastError=true)]",
    "  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);",
    "}",
    "'@",
    `$printerName='${pName}'`,
    `$filePath='${pPath}'`,
    "$bytes=[System.IO.File]::ReadAllBytes($filePath)",
    "$h=[IntPtr]::Zero",
    "if (-not [RawPrinterHelper]::OpenPrinter($printerName, [ref]$h, [IntPtr]::Zero)) { throw \"OpenPrinter failed for: $printerName\" }",
    "$docInfo = New-Object RawPrinterHelper+DOCINFOA",
    "$docInfo.pDocName = 'ESC_POS_RAW'",
    "$docInfo.pDataType = 'RAW'",
    "if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, $docInfo)) { [RawPrinterHelper]::ClosePrinter($h) | Out-Null; throw 'StartDocPrinter failed' }",
    "if (-not [RawPrinterHelper]::StartPagePrinter($h)) { [RawPrinterHelper]::EndDocPrinter($h) | Out-Null; [RawPrinterHelper]::ClosePrinter($h) | Out-Null; throw 'StartPagePrinter failed' }",
    "$ptr=[System.Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)",
    "try {",
    "  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)",
    "  $written=0",
    "  if (-not [RawPrinterHelper]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written)) { throw 'WritePrinter failed' }",
    "  if ($written -ne $bytes.Length) { throw \"WritePrinter wrote $written of $($bytes.Length) bytes\" }",
    "} finally {",
    "  [System.Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr)",
    "  [RawPrinterHelper]::EndPagePrinter($h) | Out-Null",
    "  [RawPrinterHelper]::EndDocPrinter($h) | Out-Null",
    "  [RawPrinterHelper]::ClosePrinter($h) | Out-Null",
    "}"
  ].join("\n");

  await runPowerShell(script, 30000);
  return { tmpFile };
}

module.exports = {
  listPrinters,
  printRawToWindowsPrinter
};
