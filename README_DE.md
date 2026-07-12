# ioBroker.clage-dsx

![CLAGE-DSX-Logo](admin/clage-dsx.png)

[![NPM-Version](https://img.shields.io/npm/v/iobroker.clage-dsx.svg)](https://www.npmjs.com/package/iobroker.clage-dsx)
[![Downloads](https://img.shields.io/npm/dm/iobroker.clage-dsx.svg)](https://www.npmjs.com/package/iobroker.clage-dsx)
[![Test and Release](https://github.com/TheBam1990/ioBroker.clage-dsx/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/TheBam1990/ioBroker.clage-dsx/actions/workflows/test-and-release.yml)

## Beschreibung

Der Adapter verbindet ioBroker mit einem lokalen [CLAGE](https://www.clage.de/) Home Server und den dort angemeldeten Durchlauferhitzern. Die Kommunikation erfolgt über die HTTPS-API im lokalen Netzwerk; ein Cloud-Dienst wird nicht benötigt.

Grundlage ist die mitgelieferte [CLAGE Home Server API-Spezifikation v1.3.4](CLAGE%20HomeServer%20API%20v1.3.4.pdf).

## Voraussetzungen

- ioBroker mit Node.js 22 oder neuer
- Der CLAGE Home Server muss vom ioBroker-Host erreichbar sein
- Benutzername und Passwort eines Home-Server-API-Kontos
- HTTPS-Zugriff auf den Home Server

## Konfiguration

In den Einstellungen der Instanz werden drei Werte eingetragen:

1. **IP-Adresse des CLAGE Home Servers**, zum Beispiel `192.168.2.35` (ohne `https://`)
2. **API-Benutzername**
3. **API-Passwort**

Alle drei Felder sind erforderlich. Der historische native Konfigurationsschlüssel für den Benutzernamen heißt `port`; er bleibt zur Kompatibilität mit bestehenden Installationen erhalten.

Der Home Server verwendet normalerweise ein selbstsigniertes TLS-Zertifikat. Der Adapter akzeptiert dieses lokale Zertifikat bei der direkten Verbindung mit dem konfigurierten Gerät.

## Aktueller Funktionsumfang

Für jedes angemeldete CLAGE-Gerät legt der Adapter Datenpunkte an für:

- Gerätename, Geräte-ID und Bus-ID
- Solltemperatur
- eingestellte Temperaturgrenze
- aktuellen und maximalen Durchfluss
- aktuellen Leistungswert
- Statusflags und Fehlercode
- berechnete Solltemperatur in °C

Schreibbare Datenpunkte:

- `Setpoint`: API-Wert in Zehntelgrad, zum Beispiel `450` = 45,0 °C
- `Themperatur`: Temperatur in °C; die historische Schreibweise bleibt aus Kompatibilitätsgründen erhalten
- `flowMax`: Durchflussgrenze in 0,1 l/min; besondere API-Werte sind `253` (ECO) und `254` (AUTO)
- `Name`: Gerätename

`info.connection` zeigt an, ob der Home Server erreichbar ist und die eingetragenen Zugangsdaten akzeptiert.

## Sinnvolle API-Erweiterungen

Die CLAGE-API bietet weitere Funktionen, die der Adapter aktuell noch nicht abbildet. Sinnvolle nächste Ausbaustufen sind:

- Einlauf-/Auslauftemperatur, Temperaturspeicher, Ventilstellung und Maximalleistung
- RSSI, LQI, letzte Geräteaktivität und Online-Status
- Firmware- und Seriennummern
- Gesamtverbrauch von Wasser und Energie
- letzter Zapfvorgang und historische Verbrauchsdaten
- interne Fehlerhistorie mit Text und Zeitstempeln
- Verbrühschutz, Signalton und Lastabwurf
- zunächst lesende Timerübersicht, später kontrollierte Timerbearbeitung
- Home-Server-Informationen wie Version, Funkkanal und Adresse
- HTTP Long Polling zur Vermeidung unnötiger Abfragen

Gefährliche Funktionen wie das Abmelden von Geräten, das Ändern der Home-Server-Funkadresse oder das Löschen aller Timer sollten nur mit ausdrücklicher Bestätigung und Berechtigungsprüfung ergänzt werden.

## Fehlerbehebung

- Die IP-Adresse darf kein Protokoll und keinen Pfad enthalten.
- API-Zugangsdaten in der Konfiguration des CLAGE Home Servers prüfen.
- TCP-Port 443 muss vom ioBroker-Host erreichbar sein.
- HTTP-Status `401` bedeutet ungültige Zugangsdaten; `403` bedeutet unzureichende API-Rechte.
- Ein Gerät kann angemeldet, aber vorübergehend nicht erreichbar sein. Die API meldet dies mit `404`, `410` oder einem negativen Gerätefehlercode.

## Changelog

### 0.0.2

- Laufzeitabhängigkeiten für aktuelle ioBroker- und Node.js-Versionen aktualisiert
- Administrationsoberfläche auf responsive JSON Config umgestellt
- Aktuelle ioBroker-Paketmetadaten und CI-Tests für Node.js 22 und 24 ergänzt

### 0.0.1

- Erstveröffentlichung

## Lizenz

Copyright (c) 2026 TheBam <elektrobam@gmx.de>

MIT-Lizenz. Siehe [LICENSE](LICENSE).
