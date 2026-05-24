# Supported Printers

`posprint` sends ESC/POS bytes to receipt printers. It is a good fit when your print path preserves raw bytes and the target printer understands the ESC/POS commands the package emits.

## What This Package Expects

`posprint` does not render PDF, PostScript, or XPS output.

It sends ESC/POS over these paths:

- Windows local queues through the RAW spooler
- Linux and macOS local queues through CUPS raw submission
- direct `ipp://` and `ipps://` printer URIs through the package IPP client

That means printer support depends on two things:

1. The queue or endpoint must pass the bytes through unchanged.
2. The printer must support the subset of ESC/POS commands you plan to use.

## Supported Well

- Epson TM-T88V

This package is documented and tested around Epson TM-T88V style printers. If you want the lowest-risk target, start there.

## Should Work, But Test

- nearby Epson TM receipt models with official ESC/POS documentation, including TM-T88IV, TM-T88VI, TM-T88VII, TM-T20, TM-T70, TM-T82, and TM-T83
- Epson mobile and m-series receipt lines when they are documented in the TM ESC/POS reference, including TM-m30, TM-m50, TM-P20, and TM-P80 families
- other Epson TM receipt printers covered by Epson's ESC/POS references
- non-Epson receipt printers that explicitly document Epson ESC/POS support or ESC/POS emulation
- Bixolon SRP receipt printers and Citizen CT-S receipt printers when the queue preserves raw jobs and the model supports the commands you use

These printers are reasonable candidates, but this package does not treat them as interchangeable with Epson TM models.

## Usually Not A Fit

- office printers that expect PDF, PostScript, PCL, or other page-description formats
- printer paths that rasterize, filter, or rewrite jobs before they reach the device
- printers documented only for a different command language

Star Micronics deserves a separate note here: Star printers are not one command-language family. Some models use StarPRNT, some support ESC/POS, and some can switch emulations, so model-specific emulation documentation matters.

## Known Risk Areas

- **Code pages:** `posprint` supports `cp437`, `cp850`, `cp858`, and `cp1252`. Characters outside the selected code page fall back to `?`.
- **Fonts:** the package emits ESC/POS fonts `A`, `B`, and `C`, but many printers support only a subset.
- **Cutters:** cut commands are appropriate for receipt printers with autocutters. Some printers ignore them or cut differently.
- **QR codes:** native QR commands are common on recent receipt printers, but not universal.
- **Images:** raster image support varies more than plain text support.
- **Width:** the default layout assumes a TM-T88V-style receipt width. Narrower paper or different printable widths may need `--chars-per-line` and layout changes.

## Vendor Notes

- **Epson TM family:** Epson publishes an ESC/POS command reference covering many TM printers, including TM-T20, TM-T70, TM-T82, TM-T83, TM-T88IV, TM-T88V, TM-T88VI, TM-T88VII, TM-m30, TM-m50, TM-P20, TM-P80, and TM-U220 lines. This is the strongest support evidence for `posprint`.
- **Bixolon SRP family:** Bixolon publishes SRP receipt-printer downloads and command manuals. Treat SRP models as plausible candidates, not Epson-equivalent guarantees.
- **Citizen CT-S family:** Citizen publishes CT-S receipt-printer product and integration material. Treat CT-S models as plausible receipt-printer targets that still need feature validation.
- **Star receipt printers:** Star documents multiple printer emulations, including StarPRNT and ESC/POS, across different models. Do not assume drop-in compatibility from the brand alone; check the model's emulation support.

## How To Validate A Printer

1. Run a dry run first.
2. Print a plain text receipt through the real queue or URI.
3. Confirm feed and cut behavior.
4. Check the code page you plan to use.
5. Check QR output.
6. Check raster image output.
7. Re-check spacing and width on the actual paper roll.

If plain text works but QR or images fail, the printer may still be usable with a smaller feature set.

## Sources

Repository references:

- [`README.md`](./README.md)
- [`src/print-bridge.js`](./src/print-bridge.js)
- [`src/ipp-printer.js`](./src/ipp-printer.js)
- [`src/linux-cups-printer.js`](./src/linux-cups-printer.js)
- [`src/windows-raw-printer.js`](./src/windows-raw-printer.js)
- [`src/escpos-builder.js`](./src/escpos-builder.js)
- [`src/text-transcoder.js`](./src/text-transcoder.js)
- [`src/cli-common.js`](./src/cli-common.js)

External technical references, captured 2026-05-24:

- Epson ESC/POS Command Reference for TM Printers: <https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/index.html>
- Microsoft Learn, `WritePrinter`: <https://learn.microsoft.com/en-us/windows/win32/printdocs/writeprinter>
- CUPS `lp` command reference: <https://www.cups.org/doc/man-lp.html>
- CUPS command-line printing and options guide: <https://www.cups.org/doc/options.html>
- Epson POS printer lineup: <https://epson.com/point-of-sale>

Vendor note references:

- Bixolon SRP-350plusIII downloads (captured 2026-05-24): <https://www.bixolon.com/download_view.php?idx=23>
- Citizen CT-S601II product page (captured 2026-05-24): <https://www.citizen-systems.co.jp/en/printer/product/ct_s601_2/>
- Citizen XML/Web app printer page (captured 2026-05-24): <https://www.citizen-systems.co.jp/en/printer/special/xml_web_app/>
- StarIOExt API documentation (captured 2026-05-24): <https://star-m.jp/products/s_print/sdk/starprnt_sdk/manual/wind_csharp/en/api_starioext.html>
- StarPRNT SDK getting started (captured 2026-05-24): <https://star-m.jp/products/s_print/sdk/starprnt_sdk/manual/wind_csharp/en/getting_start.html>
