"use strict";

function getArgValue(argv, flag) {
  const arg = argv.find((v) => v.startsWith(`${flag}=`));
  if (arg) {
    return arg.slice(flag.length + 1);
  }

  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  const next = argv[index + 1];
  return typeof next === "string" && !next.startsWith("--") ? next : null;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function selectPrinterName({ requested, envPrinter, printers }) {
  return (
    requested ||
    envPrinter ||
    printers.find((p) => /epson|tm-t88v|receipt/i.test(p)) ||
    printers[0]
  );
}

module.exports = { getArgValue, hasFlag, selectPrinterName };
