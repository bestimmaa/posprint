# Epson TM-T88V Printer Setup

---

## macOS / Linux (CUPS)

**Install CUPS** (Linux only — macOS has it built in):
```sh
sudo apt install cups   # Debian/Ubuntu
sudo dnf install cups   # Fedora/RHEL
```

**Enable the web UI** (macOS only):
```sh
cupsctl WebInterface=yes
```

**Add a raw queue — terminal:**
```sh
lpadmin -p T88V -E -v usb://EPSON/TM-T88V -m raw
```

If the URI doesn't match, find the right one with `lpinfo -v | grep -i epson`.

**Add a raw queue — web UI:**
1. Go to **http://localhost:631/admin** → **Add Printer**.
2. Select the Epson from the USB device list → **Continue**.
3. Name it (e.g. `T88V`) → **Continue**.
4. Driver: **Raw** → **Raw Queue (en)** → **Add Printer**.

**Test:**
```sh
echo -e "Hello\n\n\n" | lp -d T88V -o raw
```

**posprint URI:**
```
ipp://localhost:631/printers/T88V
```

**Troubleshooting:**
- `lpinfo -v` shows nothing → USB not seated or printer is off. Linux: `sudo usermod -aG lp $USER`
- Jobs vanish, nothing prints → queue not in raw mode; recreate with `-m raw`
- `lpadmin: Printer drivers are not supported` (macOS 14+) → use `-m raw` on the command line or pick **Raw Queue** in the web UI

---

## Windows (USB)

Posprint uses the Windows Print Spooler directly — no CUPS needed.

**1. Plug in the USB cable and power the printer on.** Windows usually installs it automatically with the Generic / Text Only driver. Check **Device Manager → Printers**.

**2. If auto-install fails**, open PowerShell as Administrator:
```powershell
Add-PrinterDriver -Name "Generic / Text Only"
Get-PrinterPort | Where-Object { $_.Name -like "USB*" }  # note the port, e.g. USB001
Add-Printer -Name "T88V" -DriverName "Generic / Text Only" -PortName "USB001"
```

**3. Confirm the queue name** (posprint uses this, not a URI):
```powershell
Get-Printer | Select-Object Name, PrinterStatus
```

**4. Test:**
```powershell
"Hello`n`n`n" | Out-Printer -Name "T88V"
```

**Troubleshooting:**
- `OpenPrinter failed` → printer name must match exactly (case-sensitive). Re-check with `Get-Printer`.
- Job disappears, nothing prints → queue is paused; check **Printers & scanners → Manage**.
- Garbage characters print → the driver is re-encoding ESC/POS bytes; switch to Generic / Text Only.
- USB port not found → unplug, replug, wait 5 s, re-run `Get-PrinterPort`.

---

## Network (Ethernet / Wi-Fi, any OS)

Network ESC/POS printers (for example a TM-T88V with an Ethernet interface) accept raw jobs on TCP port 9100. posprint can send to them directly, with no CUPS queue, IPP, or Windows driver.

**1. Find the printer's IP address.** Hold the feed button while powering on to print a status sheet, or check your router's DHCP leases. A DHCP reservation keeps the address stable.

**2. Check the port is reachable:**
```sh
nc -vz 192.168.1.50 9100                            # macOS / Linux
Test-NetConnection 192.168.1.50 -Port 9100         # Windows PowerShell
```

**posprint URI:**
```
tcp://192.168.1.50:9100
```
The port can be omitted (`tcp://192.168.1.50`) because it defaults to 9100.

**Troubleshooting:**
- `TCP connection failed ... ECONNREFUSED` → wrong port, or raw/port-9100 printing is disabled in the printer's network settings.
- `TCP print timed out` → wrong IP address, printer offline, or a firewall is dropping traffic to port 9100.