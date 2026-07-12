# ioBroker.clage-dsx

![CLAGE DSX logo](admin/clage-dsx.png)

[![NPM version](https://img.shields.io/npm/v/iobroker.clage-dsx.svg)](https://www.npmjs.com/package/iobroker.clage-dsx)
[![Downloads](https://img.shields.io/npm/dm/iobroker.clage-dsx.svg)](https://www.npmjs.com/package/iobroker.clage-dsx)
[![Test and Release](https://github.com/TheBam1990/ioBroker.clage-dsx/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/TheBam1990/ioBroker.clage-dsx/actions/workflows/test-and-release.yml)

[Deutsche Dokumentation](README_DE.md)

## Description

This adapter connects ioBroker to a local [CLAGE](https://www.clage.com/) Home Server and its registered instantaneous water heaters. Communication uses the HTTPS API in the local network; no cloud service is required.

The implementation is based on the included [CLAGE Home Server API specification v1.3.4](CLAGE%20HomeServer%20API%20v1.3.4.pdf).

## Requirements

- ioBroker with Node.js 22 or newer
- CLAGE Home Server reachable from the ioBroker host
- Home Server API user name and password
- HTTPS access to the Home Server

## Configuration

Open the instance settings and enter:

1. **CLAGE Home Server IP address**, for example `192.168.2.35` (without `https://`)
2. **API user name**
3. **API password**

All three fields are required. The historical native configuration key for the user name is called `port`; this is retained for compatibility with existing installations.

The Home Server normally uses a self-signed TLS certificate. The adapter therefore accepts the local certificate when connecting directly to the configured device.

## Current functionality

For every registered CLAGE device, the adapter creates states for:

- device name, device ID and bus ID
- temperature setpoint
- configured temperature limit
- current flow and maximum flow
- current power value
- device flags and error code
- calculated setpoint temperature in °C

Writable states:

- `Setpoint`: API value in tenths of a degree Celsius, e.g. `450` = 45.0 °C
- `Themperatur`: temperature in °C; retained with its historical spelling for compatibility
- `flowMax`: flow limit in tenths of a litre per minute; special API values include `253` (ECO) and `254` (AUTO)
- `Name`: device name

`info.connection` indicates whether the Home Server is reachable and accepts the configured credentials.

## Planned API extensions

The CLAGE API provides additional functions that are not exposed by the current adapter yet. Suitable future extensions include:

- inlet/outlet temperature, temperature memories, valve position and maximum power
- RSSI, LQI, device activity and connected state
- firmware and serial numbers
- total water and energy consumption
- last draw-off cycle and historical consumption records
- device error history with text and timestamps
- scald protection, acoustic signal and load-shedding settings
- read-only timer overview and, later, controlled timer editing
- Home Server information such as version, radio channel and address
- HTTP long polling to reduce unnecessary requests

Destructive operations such as unregistering devices, changing the Home Server radio address or deleting all timers should only be added with explicit confirmation and permission checks.

## Troubleshooting

- Verify that the IP address contains no protocol prefix or path.
- Verify the API credentials in the CLAGE Home Server configuration.
- Ensure that TCP port 443 is reachable from the ioBroker host.
- HTTP status `401` means invalid credentials; `403` means insufficient API permissions.
- A device can be registered but temporarily unavailable. The API reports this as `404`, `410` or a negative device error code.

## Changelog

### 0.0.2

- Updated runtime dependencies for current ioBroker and Node.js versions
- Migrated the administration page to responsive JSON Config
- Added current ioBroker package metadata and CI tests for Node.js 22 and 24

### 0.0.1

- Initial release

## License

Copyright (c) 2026 TheBam <elektrobam@gmx.de>

MIT License. See [LICENSE](LICENSE).
