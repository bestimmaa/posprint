# Setting Up the Epson TM-T88V in CUPS

This guide covers adding the Epson TM-T88V receipt printer to CUPS so it can be used with posprint or any IPP-capable tool.

## Prerequisites

- **macOS**: CUPS is built in — nothing to install.
- **Linux**: Install CUPS if not already present.
  ```sh
  # Debian / Ubuntu
  sudo apt install cups

  # Fedora / RHEL
  sudo dnf install cups
  ```

Connect the printer via USB and power it on before continuing.

---

## 1. Enable the CUPS Web Interface (macOS only)

By default the CUPS admin UI is disabled on macOS:

```sh
cupsctl WebInterface=yes
```

Then open **http://localhost:631** in a browser to confirm it loads.

---

## 2. Add the Printer

### Option A — Command line (recommended)

```sh
lpadmin -p T88V -E -v usb://EPSON/TM-T88V -m raw
```

| Flag | Meaning |
|------|---------|
| `-p T88V` | Queue name (you can call it anything) |
| `-E` | Enable and accept jobs immediately |
| `-v usb://…` | Device URI — see note below |
| `-m raw` | Raw queue: no driver, passes ESC/POS bytes unchanged |

**Finding the correct device URI** if the one above doesn't match:

```sh
lpinfo -v | grep -i epson
```

Pick the `usb://` line that mentions T88V and use it for `-v`.

### Option B — Web UI

1. Go to **http://localhost:631/admin** and click **Add Printer**.
2. Select the Epson from the detected USB devices and click **Continue**.
3. Set a name (e.g. `T88V`) and click **Continue**.
4. For the driver, choose **Raw** → **Raw Queue (en)** and click **Add Printer**.

---

## 3. Set the Default Paper Size

The TM-T88V uses 80 mm roll paper. Tell CUPS not to scale or margin the output:

```sh
lpoptions -p T88V -o media=Custom.80x200mm -o fit-to-page=false
```

For raw ESC/POS printing (which posprint uses), this step has no effect on actual output — but it prevents CUPS from logging page-size warnings.

---

## 4. Test the Queue

Print a self-test page:

```sh
echo -e "Hello, printer!\n\n\n" | lp -d T88V -o raw
```

The printer should feed and print the text. If nothing happens, check:

```sh
lpstat -p T88V   # should say "idle" or "processing"
lpq -P T88V      # shows any stuck jobs
```

---

## 5. Use with posprint

Once the queue is set up, the IPP URI for posprint is:

```
ipp://localhost:631/printers/T88V
```

Replace `T88V` with whatever name you gave the queue in step 2.

For a printer on another machine on the network, replace `localhost` with that machine's hostname or IP:

```
ipp://taiga.local:631/printers/T88V
```

---

## Troubleshooting

**`lpinfo -v` shows nothing**
The USB cable may not be seated, or the printer is off. On Linux you may also need to add your user to the `lp` group: `sudo usermod -aG lp $USER` (then log out and back in).

**Jobs disappear but nothing prints**
The queue may not be in raw mode. Recreate it with `-m raw` (Option A above).

**`lpadmin: Printer drivers are not supported` (macOS Ventura+)**
Apple removed driver-based queues in macOS 14+. Use the web UI (Option B) and select **Raw Queue**, or use the command line with `-m raw` which bypasses the driver system entirely.

**Permission denied on Linux**
Run `lpadmin` with `sudo`, then make sure the CUPS socket is accessible to your user.
