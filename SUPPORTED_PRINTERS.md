# Supported Printers

`posprint` generates ESC/POS byte streams for receipt-style printers. This document explains which printer classes are the best fit, which setups are likely to work with caveats, and which printer paths are outside the package's intended support profile.

## Overview

`posprint` does not render pages as PDF, PostScript, or XPS. It builds printer-ready ESC/POS commands and sends them through one of these paths:

- Windows local queue printing through the RAW spooler
- Linux/macOS local queue printing through CUPS raw submission
- Direct IPP/IPPS URI printing for reachable printer endpoints

In practice, a printer works well with `posprint` when both of these conditions hold:

1. The print path passes raw bytes through without rewriting them.
2. The target printer understands the ESC/POS commands that `posprint` emits.

The package is currently documented around Epson TM-T88V style receipt printers, so that family is the strongest documented fit.

## Compatibility Summary

### Recommended

- Epson TM-T88V
- Epson TM-series receipt printers with well-documented ESC/POS support and raw queue printing
- Printer queues and IPP endpoints that preserve raw ESC/POS bytes unchanged

### Likely Compatible

- Closely related receipt printers with well-documented ESC/POS support and raw queue printing
- Non-Epson receipt printers that explicitly document Epson ESC/POS emulation and work reliably with raw queue submission

### Test Carefully

- Generic printers marketed only as "ESC/POS compatible"
- Mobile, label, or specialty receipt printers where cutter, width, image, or QR behavior may differ
- IPP/IPPS printer targets that accept jobs over the protocol but do not clearly document raw ESC/POS handling

### Not Recommended

- Office printers that expect page-description formats instead of ESC/POS
- Print paths that rasterize, transform, or reinterpret jobs before they reach the printer
- Printers whose vendors only document a different command language

## Known Good Fit

The strongest documented fit for `posprint` is the Epson TM-T88V.

That alignment appears throughout the repository:

- `README.md` describes `posprint` as producing output for Epson TM-T88V style printers.
- Example commands use TM-T88V queue names and TM-T88V IPP queue names.
- Printer auto-selection heuristics look for names like `epson`, `tm-t88v`, and `receipt`.

Other Epson TM receipt models are plausible adjacent fits when they support the same core ESC/POS features, especially standard text formatting, feed, cut, QR, and raster image commands. Even within Epson families, support still varies by exact model and firmware generation, so this document treats TM-T88V as the primary reference point rather than asserting broad certification across the entire product line.

## Other ESC/POS Printers

`posprint` is not limited to Epson-branded hardware, but non-Epson compatibility depends on the printer's actual command support rather than on marketing language alone.

A non-Epson printer is a better candidate when it explicitly documents one or more of the following:

- Epson ESC/POS support
- ESC/POS emulation mode
- Raw command printing through the installed queue or endpoint

Compatibility should be treated as progressively less certain when documentation becomes less specific. A claim like "ESC/POS compatible" often means basic text, feed, and cut support, but not necessarily the same QR, image, charset, or font behavior used by Epson models.

## Platform Requirements

### Windows

On Windows, `posprint` uses the installed local printer queue and sends bytes through the RAW spooler path. This works best when the Windows print path preserves ESC/POS bytes exactly as submitted.

Practical implications:

- Use a printer queue that supports raw pass-through.
- Do not assume that a generic Windows printing path will translate a receipt job into the printer's native command language.
- If a queue expects rendered pages instead of raw commands, the job may print garbage or fail.

### Linux And macOS

On Linux and macOS, `posprint` submits jobs through CUPS tooling such as `lp` or `lpr` with raw printing options. Compatibility depends on the queue configuration still forwarding the ESC/POS payload unchanged.

Practical implications:

- Prefer queues known to support raw submission.
- Avoid filter chains that convert or wrap the job before it reaches the device.
- Verify that the selected queue represents the actual receipt printer target rather than a transformed print workflow.

### IPP/IPPS URIs

`posprint` also supports direct `ipp://` and `ipps://` targets. Protocol reachability alone does not guarantee receipt-printer compatibility.

A direct URI is a good candidate only when the endpoint accepts raw octet-stream jobs and routes them to a printer that understands the emitted ESC/POS commands.

## Feature Caveats

Even when a printer accepts raw ESC/POS jobs, feature support can still vary by model.

### Text And Code Pages

`posprint` supports `cp437`, `cp850`, `cp858`, and `cp1252`. Unsupported characters are replaced with `?` after a small normalization pass for common punctuation and spacing variants.

Printers with different code-page coverage may still print, but extended characters can degrade unexpectedly.

### Font Selection

The package exposes ESC/POS fonts `A`, `B`, and `C`. Some printers only support a subset of those fonts, so font `C` should be treated as model-dependent.

### Cut Support

`posprint` uses ESC/POS cut commands suitable for receipt printers with an autocutter. Printers without an autocutter, or printers with different cutter behavior, may feed paper differently or ignore the command.

### QR Support

QR support is common on modern ESC/POS receipt printers, but not universal. Older or partial implementations may reject the command sequence or render codes inconsistently.

### Raster Image Support

Image printing is usually the first advanced feature to expose vendor differences. A printer may support text and cut successfully while still producing poor image output, truncated images, or no image at all.

### Width And Layout Assumptions

The default `charsPerLine` setting is tuned for a TM-T88V style receipt width. Narrower paper widths, different default fonts, or different printable areas may require explicit layout changes for acceptable output.

## Validation Checklist

When testing a target printer with `posprint`, validate in this order:

1. Dry-run the receipt to confirm the payload is generated successfully.
2. Print a plain text receipt through the intended queue or URI.
3. Confirm basic feed and final cut behavior.
4. Confirm non-ASCII characters in the intended code page.
5. Confirm QR output.
6. Confirm raster image output.
7. Re-check layout with the actual paper width and chosen font.

If text works but advanced features fail, the printer may still be partially usable with a narrower feature set.

## Sources

Repository references:

- [`README.md`](./README.md)
- [`src/print-bridge.js`](./src/print-bridge.js)
- [`src/markdown-to-escpos.js`](./src/markdown-to-escpos.js)
- [`src/escpos-builder.js`](./src/escpos-builder.js)
- [`src/windows-raw-printer.js`](./src/windows-raw-printer.js)
- [`src/linux-cups-printer.js`](./src/linux-cups-printer.js)
- [`src/ipp-printer.js`](./src/ipp-printer.js)
- [`src/cli-common.js`](./src/cli-common.js)
- [`src/text-transcoder.js`](./src/text-transcoder.js)
- [`src/printer-uri.js`](./src/printer-uri.js)

External technical references, captured 2026-05-23:

- Epson, ESC/POS Command Reference for TM Printers: <https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/index.html>
- Microsoft Learn, `WritePrinter` function: <https://learn.microsoft.com/en-us/windows/win32/printdocs/writeprinter>
- CUPS `lp` command reference: <https://www.cups.org/doc/man-lp.html>
- CUPS command-line printing and options guide: <https://www.cups.org/doc/options.html>
