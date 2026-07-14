"use strict";

const https = require("node:https");
const axios = require("axios").default;
const utils = require("@iobroker/adapter-core");

const ACCESS = {
  setpointRead: 0,
  setpointWrite: 1,
  statusRead: 2,
  setupRead: 4,
  setupWrite: 5,
  errorsRead: 6,
  logsRead: 8,
  listRead: 10,
  listWrite: 11,
  timerRead: 12,
  timerWrite: 13,
};

const DEFAULT_SERVICES = {
  deviceList: "/devices",
  deviceStatus: "/devices/status",
  deviceSetpoint: "/devices/setpoint",
  deviceSetup: "/devices/setup",
  deviceErrors: "/devices/errors",
  deviceLogs: "/devices/logs",
  timerList: "/timers",
};

const ERROR_TEXTS = {
  "-6": "Bus ID unknown or not assigned",
  "-3": "Device timeout",
  "-1": "Device not registered or unavailable",
  0: "No error",
  10: "Bus system error / control panel defective",
  11: "Overvoltage",
  12: "Undervoltage",
  13: "Phase error",
  51: "Outlet temperature invalid",
  53: "Inlet temperature invalid",
  56: "Outlet temperature sensor defective",
  58: "Inlet temperature sensor defective",
  59: "Temperature sensors interchanged",
  61: "Calibration value too high",
  62: "Calibration value too low",
  63: "Heating element error",
  75: "Flow too high / air in system",
  76: "Outlet temperature too high / air in system",
  77: "Air bubbles detected",
  80: "Radio module initialization error",
  99: "Unknown error",
};

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toCelsius(value) {
  return value === null || value === undefined ? null : asNumber(value) / 10;
}

function errorText(code) {
  return ERROR_TEXTS[String(code)] || `Unknown error (${code})`;
}

function sanitizeId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
}

class ClageDsx extends utils.Adapter {
  /**
   * @param {Partial<utils.AdapterOptions>} [options] Adapter options
   */
  constructor(options) {
    super({ ...options, name: "clage-dsx" });
    this.client = axios.create();
    this.devices = new Map();
    this.services = { ...DEFAULT_SERVICES };
    this.serverRevision = 1;
    this.activePollMs = 2000;
    this.idlePollMs = 30000;
    this.detailsPollMs = 300000;
    this.historyDays = 30;
    this.longPolling = true;
    this.statusTimer = null;
    this.detailTimer = null;
    this.listTimer = null;
    this.longPollTimer = null;
    this.longPollController = null;
    this.setpointTimers = new Map();
    this.stopped = false;

    this.on("ready", () => this.onReady());
    this.on("stateChange", (id, state) => this.onStateChange(id, state));
    this.on("unload", (callback) => this.onUnload(callback));
  }

  async onReady() {
    this.stopped = false;
    await this.createRootObjects();
    await this.subscribeStatesAsync("*");
    await this.setStateAsync("info.connection", false, true);
    await this.setStateAsync("info.lastError", "", true);

    const host = String(this.config.adresse || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    const username = String(this.config.port || "").trim();
    const password = String(this.config.apiKey || "");
    if (!host || !username || !password) {
      await this.setError("IP address, API user name and API password are required");
      return;
    }

    this.activePollMs = Math.min(Math.max(asNumber(this.config.activePollMs, 2000), 1000), 3600000);
    this.idlePollMs = Math.min(Math.max(asNumber(this.config.idlePollMs, 30000), 5000), 3600000);
    this.detailsPollMs = Math.min(Math.max(asNumber(this.config.detailsPollMs, 300000), 60000), 3600000);
    this.historyDays = Math.max(asNumber(this.config.historyDays, 30), 1);
    this.longPolling = this.config.longPolling !== false;
    this.client = axios.create({
      baseURL: `https://${host}`,
      auth: { username, password },
      timeout: 15000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: { Accept: "application/json" },
    });
    this.client.interceptors.response.use((response) => {
      const apiError = response.data && response.data.error;
      if (apiError !== undefined && apiError !== null && apiError !== "" && apiError !== 0 && apiError !== "0") {
        throw new Error(`CLAGE API error: ${typeof apiError === "object" ? JSON.stringify(apiError) : apiError}`);
      }
      return response;
    });

    try {
      await this.refreshServerInfo();
      await this.refreshDevices();
      await this.refreshTimers();
      await this.setStateAsync("info.connection", true, true);
      await this.setStateAsync("info.lastError", "", true);
      this.startStatusLoop();
      this.startDetailsLoop();
      if (this.longPolling && this.services.deviceList) {
        this.startLongPolling();
      } else {
        this.scheduleListRefresh();
      }
    } catch (error) {
      await this.handleRequestError("Initialization failed", error);
      this.scheduleListRefresh();
    }
  }

  async createRootObjects() {
    await this.ensureChannel("info", "Information");
    await this.ensureChannel("server", "CLAGE Home Server");
    await this.ensureChannel("timers", "Timer management");
    await this.ensureState("info.connection", "Connected", "boolean", "indicator.connected", true, false);
    await this.ensureState("info.lastError", "Last error", "string", "text", true, false);
    await this.ensureState("info.lastUpdate", "Last successful update", "string", "date", true, false);
    await this.ensureState("info.apiVersion", "API version", "string", "text", true, false);
    await this.ensureState("info.servicesJson", "Available services", "string", "json", true, false);
    for (const [id, name, type, role] of [
      ["server.id", "Server ID", "string", "info.serial"],
      ["server.name", "Server name", "string", "info.name"],
      ["server.channel", "Radio channel", "number", "value"],
      ["server.address", "Radio address", "number", "value"],
      ["server.version", "Server version", "string", "text"],
      ["server.revision", "Server revision", "string", "text"],
      ["timers.listJson", "All timers", "string", "json"],
      ["timers.lastResultJson", "Last timer command result", "string", "json"],
    ]) {
      await this.ensureState(id, name, type, role, true, false);
    }
    await this.ensureState("timers.refresh", "Refresh timers", "boolean", "button", false, true);
    await this.ensureState("timers.createJson", "Create timer from JSON", "string", "json", false, true);
    await this.ensureState("timers.updateJson", "Update timer from JSON", "string", "json", false, true);
    await this.ensureState("timers.deleteId", "Delete timer by ID", "string", "text", false, true);
  }

  async refreshServerInfo() {
    const response = await this.client.get("/");
    const data = response.data || {};
    this.services = Object.assign({}, DEFAULT_SERVICES, ...((Array.isArray(data.services) && data.services) || []));
    const server = data.server || {};
    await this.setStateAsync("info.apiVersion", String(data.version || ""), true);
    await this.setStateAsync("info.servicesJson", JSON.stringify(this.services), true);
    for (const key of ["id", "name", "channel", "address", "version", "revision"]) {
      if (server[key] !== undefined && server[key] !== null) {
        await this.setStateAsync(`server.${key}`, server[key], true);
      }
    }
  }

  async refreshDevices(data) {
    const payload = data || (await this.client.get(this.services.deviceList || "/devices")).data || {};
    this.serverRevision = asNumber(payload.rev, this.serverRevision || 1);
    for (const raw of Array.isArray(payload.devices) ? payload.devices : []) {
      await this.registerDevice(raw);
    }
    await this.refreshAllStatuses(true);
    await this.touch();
  }

  async registerDevice(raw) {
    if (!raw || !raw.id) {
      return;
    }
    const key = raw.busId > 0 ? String(raw.busId) : `device_${sanitizeId(raw.id)}`;
    let device = this.devices.get(raw.id);
    if (!device) {
      device = { id: raw.id, key, access: 0xffff, active: false, lastStatus: 0 };
      this.devices.set(raw.id, device);
      await this.createDeviceObjects(device);
    }
    device.key = key;
    device.access = asNumber(raw.info && raw.info.access, device.access);
    device.active = raw.info && raw.info.flags !== undefined ? (asNumber(raw.info.flags) & 1) === 0 : device.active;

    const base = {
      Name: raw.name,
      busID: raw.busId,
      id: raw.id,
      connected: raw.connected,
      rssi: raw.rssi,
      lqi: raw.lqi,
      access: device.access,
      activity: raw.info && raw.info.activity ? new Date(raw.info.activity * 1000).toISOString() : "",
    };
    for (const [name, value] of Object.entries(base)) {
      if (value !== undefined && value !== null) {
        await this.setStateChangedAsync(`${key}.${name}`, value, true);
      }
    }
    if (raw.info) {
      await this.writeBasicStatus(device, raw.info);
    }
  }

  async createDeviceObjects(device) {
    await this.setObjectNotExistsAsync(device.key, {
      type: "device",
      common: { name: `CLAGE ${device.id}` },
      native: { deviceId: device.id },
    });
    for (const channel of ["status", "setup", "consumption", "errors"]) {
      await this.ensureChannel(`${device.key}.${channel}`, channel[0].toUpperCase() + channel.slice(1));
    }
    const definitions = [
      ["Name", "Device name", "string", "info.name", true, true],
      ["busID", "Bus ID", "number", "value", true, false],
      ["id", "Device ID", "string", "info.serial", true, false],
      ["connected", "Device connected", "boolean", "indicator.connected", true, false],
      ["rssi", "Signal strength", "number", "value", true, false, "dBm"],
      ["lqi", "Link quality indicator", "number", "value", true, false],
      ["access", "API access mask", "number", "value", true, false],
      ["activity", "Last radio activity", "string", "date", true, false],
      ["Setpoint", "Setpoint raw", "number", "level.temperature", true, true, "0.1 °C"],
      ["Themperatur", "Setpoint temperature (legacy)", "number", "level.temperature", true, true, "°C"],
      ["tLimit", "Temperature limit raw", "number", "value.temperature", true, false, "0.1 °C"],
      ["flow", "Water flow raw", "number", "value", true, false, "0.1 l/min"],
      ["flowMax", "Maximum flow raw", "number", "level", true, true, "0.1 l/min"],
      ["power", "Power raw", "number", "value", true, false],
      ["flags", "Status flags", "number", "value", true, false],
      ["Error", "Error code", "number", "value", true, false],
      ["error_text", "Error text", "string", "text", true, false],
    ];
    for (const definition of definitions) {
      await this.ensureState(`${device.key}.${definition[0]}`, ...definition.slice(1));
    }

    for (const [name, label, type, role, unit] of [
      ["setpoint", "Setpoint", "number", "value.temperature", "°C"],
      ["temperatureLimit", "Temperature limit", "number", "value.temperature", "°C"],
      ["inletTemperature", "Inlet temperature", "number", "value.temperature", "°C"],
      ["outletTemperature", "Outlet temperature", "number", "value.temperature", "°C"],
      ["preset1", "Temperature preset 1", "number", "value.temperature", "°C"],
      ["preset2", "Temperature preset 2", "number", "value.temperature", "°C"],
      ["preset3", "Temperature preset 3", "number", "value.temperature", "°C"],
      ["preset4", "Temperature preset 4", "number", "value.temperature", "°C"],
      ["flow", "Water flow", "number", "value", "l/min"],
      ["flowMax", "Maximum flow", "number", "value", "l/min"],
      ["flowLimitMode", "Flow limit mode", "string", "text", ""],
      ["valvePosition", "Valve position", "number", "value", "%"],
      ["powerRaw", "Power raw", "number", "value", ""],
      ["power", "Calculated power", "number", "value.power", "kW"],
      ["powerMax", "Maximum power", "number", "value.power", "kW"],
      ["heatingActive", "Heating active", "boolean", "indicator", ""],
      ["flags", "Status flags", "number", "value", ""],
      ["errorCode", "Error code", "number", "value", ""],
      ["errorText", "Error text", "string", "text", ""],
    ]) {
      await this.ensureState(`${device.key}.status.${name}`, label, type, role, true, false, unit);
    }

    const setup = [
      ["swVersion", "Firmware version", "string", "text", false],
      ["serialDevice", "Device serial number", "string", "info.serial", false],
      ["serialPowerUnit", "Power unit serial number", "string", "info.serial", false],
      ["flowMax", "Maximum flow raw", "number", "level", true, "0.1 l/min"],
      ["loadShedding", "Load shedding", "number", "level", true, ""],
      ["scaldProtection", "Scald protection", "number", "level.temperature", true, "°C"],
      ["sound", "Acoustic signal", "boolean", "switch.enable", true, ""],
      ["fcpAddr", "FCP address", "number", "value", false, ""],
      ["powerCosts", "Power costs", "number", "value", false, "ct/kWh"],
      ["powerMax", "Maximum power", "number", "value.power", false, "kW"],
      ["calValue", "Calibration value", "number", "value", false, ""],
      ["timerPowerOn", "Heating duration", "number", "value.interval", false, "s"],
      ["timerLifetime", "Total operating time", "number", "value.interval", false, "s"],
      ["timerStandby", "Standby duration", "number", "value.interval", false, "s"],
      ["totalPowerConsumption", "Total energy consumption", "number", "value.energy.consumed", false, "kWh"],
      ["totalWaterConsumption", "Total water consumption", "number", "value", false, "l"],
    ];
    for (const [name, label, type, role, write, unit] of setup) {
      await this.ensureState(
        `${device.key}.setup.${name}`,
        label,
        type,
        role,
        true,
        Boolean(write),
        unit ? String(unit) : "",
      );
    }

    for (const [name, label, type, role, unit] of [
      ["lastId", "Last draw-off ID", "number", "value", ""],
      ["lastTime", "Last draw-off time", "string", "date", ""],
      ["lastDuration", "Last draw-off duration", "number", "value.interval", "s"],
      ["lastEnergy", "Last draw-off energy", "number", "value.energy.consumed", "Wh"],
      ["lastWater", "Last draw-off water", "number", "value", "l"],
      ["totalDuration", "Total draw-off duration", "number", "value.interval", "s"],
      ["totalEnergy", "Total draw-off energy", "number", "value.energy.consumed", "Wh"],
      ["totalWater", "Total draw-off water", "number", "value", "l"],
      ["historyJson", "Draw-off history", "string", "json", ""],
    ]) {
      await this.ensureState(`${device.key}.consumption.${name}`, label, type, role, true, false, unit);
    }
    await this.ensureState(`${device.key}.errors.currentCode`, "Current error code", "number", "value", true, false);
    await this.ensureState(`${device.key}.errors.currentText`, "Current error text", "string", "text", true, false);
    await this.ensureState(`${device.key}.errors.historyJson`, "Error history", "string", "json", true, false);
    await this.ensureState(`${device.key}.timersJson`, "Device timers", "string", "json", true, false);
  }

  async writeBasicStatus(device, info) {
    const status = { setpoint: info.setpoint, tLimit: info.tLimit, flags: info.flags, error: info.error };
    await this.writeStatus(device, status);
  }

  async refreshAllStatuses(force = false) {
    for (const device of this.devices.values()) {
      if (force || device.active || Date.now() - device.lastStatus >= this.idlePollMs) {
        await this.refreshStatus(device);
      }
    }
  }

  async refreshStatus(device) {
    if (!this.can(device, ACCESS.statusRead) || !this.services.deviceStatus) {
      return;
    }
    try {
      const response = await this.client.get(`${this.services.deviceStatus}/${device.id}`);
      const raw = response.data && response.data.devices && response.data.devices[0];
      if (raw) {
        await this.registerDevice(raw);
        await this.writeStatus(device, raw.status || {});
        device.lastStatus = Date.now();
        await this.setStateAsync("info.connection", true, true);
      }
    } catch (error) {
      await this.handleRequestError(`Status request failed for ${device.id}`, error, true);
    }
  }

  async writeStatus(device, status) {
    const key = device.key;
    const raw = (name) => (status[name] === undefined || status[name] === null ? null : asNumber(status[name]));
    const values = {
      [`${key}.Setpoint`]: raw("setpoint"),
      [`${key}.Themperatur`]: toCelsius(status.setpoint),
      [`${key}.tLimit`]: raw("tLimit"),
      [`${key}.flow`]: raw("flow"),
      [`${key}.flowMax`]: raw("flowMax"),
      [`${key}.power`]: raw("power"),
      [`${key}.flags`]: raw("flags"),
      [`${key}.Error`]: raw("error"),
      [`${key}.error_text`]: status.error === undefined ? null : errorText(status.error),
      [`${key}.status.setpoint`]: toCelsius(status.setpoint),
      [`${key}.status.temperatureLimit`]: toCelsius(status.tLimit),
      [`${key}.status.inletTemperature`]: toCelsius(status.tIn),
      [`${key}.status.outletTemperature`]: toCelsius(status.tOut),
      [`${key}.status.preset1`]: toCelsius(status.tP1),
      [`${key}.status.preset2`]: toCelsius(status.tP2),
      [`${key}.status.preset3`]: toCelsius(status.tP3),
      [`${key}.status.preset4`]: toCelsius(status.tP4),
      [`${key}.status.flow`]: status.flow === undefined ? null : asNumber(status.flow) / 10,
      [`${key}.status.flowMax`]: status.flowMax === undefined ? null : asNumber(status.flowMax) / 10,
      [`${key}.status.flowLimitMode`]:
        status.flowMax === undefined
          ? null
          : asNumber(status.flowMax) === 253
            ? "ECO"
            : asNumber(status.flowMax) === 254
              ? "AUTO"
              : "manual",
      [`${key}.status.valvePosition`]: raw("valvePos"),
      [`${key}.status.powerRaw`]: raw("power"),
      [`${key}.status.power`]: status.power === undefined ? null : asNumber(status.power) * 0.15,
      [`${key}.status.powerMax`]: status.powerMax === undefined ? null : asNumber(status.powerMax) * 0.15,
      [`${key}.status.flags`]: raw("flags"),
      [`${key}.status.heatingActive`]: status.flags === undefined ? null : (asNumber(status.flags) & 1) === 0,
      [`${key}.status.errorCode`]: raw("error"),
      [`${key}.status.errorText`]: status.error === undefined ? null : errorText(status.error),
    };
    if (status.flags !== undefined) {
      device.active = (asNumber(status.flags) & 1) === 0;
    }
    for (const [id, value] of Object.entries(values)) {
      if (value !== null) {
        await this.setStateChangedAsync(id, value, true);
      }
    }
  }

  async refreshDeviceDetails(device) {
    const tasks = [];
    if (this.can(device, ACCESS.setupRead) && this.services.deviceSetup) {
      tasks.push(this.refreshSetup(device));
    }
    if (this.can(device, ACCESS.logsRead) && this.services.deviceLogs) {
      tasks.push(this.refreshConsumption(device));
    }
    if (this.can(device, ACCESS.errorsRead) && this.services.deviceErrors) {
      tasks.push(this.refreshErrors(device));
    }
    await Promise.allSettled(tasks);
  }

  async refreshSetup(device) {
    const response = await this.client.get(`${this.services.deviceSetup}/${device.id}`);
    const raw = response.data && response.data.devices && response.data.devices[0];
    const setup = (raw && raw.setup) || {};
    const transformed = {
      swVersion: setup.swVersion,
      serialDevice: setup.serialDevice,
      serialPowerUnit: setup.serialPowerUnit,
      flowMax: setup.flowMax,
      loadShedding: setup.loadShedding,
      scaldProtection: toCelsius(setup.scaldProtection),
      sound: setup.sound === undefined ? undefined : Boolean(setup.sound),
      fcpAddr: setup.fcpAddr,
      powerCosts: setup.powerCosts,
      powerMax: setup.powerMax === undefined ? undefined : asNumber(setup.powerMax) * 0.15,
      calValue: setup.calValue,
      timerPowerOn: setup.timerPowerOn,
      timerLifetime: setup.timerLifetime,
      timerStandby: setup.timerStandby,
      totalPowerConsumption: setup.totalPowerConsumption,
      totalWaterConsumption: setup.totalWaterConsumption,
    };
    for (const [name, value] of Object.entries(transformed)) {
      if (value !== undefined && value !== null) {
        await this.setStateChangedAsync(`${device.key}.setup.${name}`, value, true);
      }
    }
  }

  async refreshConsumption(device) {
    const [historyResponse, totalResponse] = await Promise.all([
      this.client.get(`${this.services.deviceLogs}/${device.id}`, {
        params: { from_time: Math.floor(Date.now() / 1000) - this.historyDays * 86400 },
      }),
      this.client.get(this.services.deviceLogs, { params: { showTotal: true } }),
    ]);
    const historyDevice = historyResponse.data && historyResponse.data.devices && historyResponse.data.devices[0];
    const logs = (historyDevice && historyDevice.logs) || [];
    const latest = logs.at(-1) || {};
    const totalDevice = (totalResponse.data.devices || []).find((item) => item.id === device.id) || {};
    const total = (totalDevice.logs && totalDevice.logs[0]) || {};
    const values = {
      lastId: latest.id,
      lastTime: latest.time ? new Date(latest.time * 1000).toISOString() : undefined,
      lastDuration: latest.length,
      lastEnergy: latest.power,
      lastWater: latest.water === undefined ? undefined : asNumber(latest.water) / 100,
      totalDuration: total.length,
      totalEnergy: total.power,
      totalWater: total.water === undefined ? undefined : asNumber(total.water) / 100,
      historyJson: JSON.stringify(logs),
    };
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) {
        await this.setStateChangedAsync(`${device.key}.consumption.${name}`, value, true);
      }
    }
  }

  async refreshErrors(device) {
    const response = await this.client.get(`${this.services.deviceErrors}/${device.id}`);
    const raw = response.data && response.data.devices && response.data.devices[0];
    const errors = (raw && raw.errors) || [];
    const current = errors[0] || {};
    if (current.code !== undefined) {
      await this.setStateChangedAsync(`${device.key}.errors.currentCode`, current.code, true);
    }
    if (current.text !== undefined) {
      await this.setStateChangedAsync(`${device.key}.errors.currentText`, current.text, true);
    }
    await this.setStateChangedAsync(`${device.key}.errors.historyJson`, JSON.stringify(errors), true);
  }

  async refreshTimers() {
    if (!this.services.timerList || !this.anyDeviceCan(ACCESS.timerRead)) {
      return;
    }
    try {
      const response = await this.client.get(this.services.timerList);
      const timers = Array.isArray(response.data && response.data.timers) ? response.data.timers : [];
      await this.setStateChangedAsync("timers.listJson", JSON.stringify(timers), true);
      for (const device of this.devices.values()) {
        await this.setStateChangedAsync(
          `${device.key}.timersJson`,
          JSON.stringify(timers.filter((timer) => timer.deviceId === device.id)),
          true,
        );
      }
    } catch (error) {
      await this.handleRequestError("Timer request failed", error, true);
    }
  }

  startStatusLoop() {
    const run = async () => {
      if (this.stopped) {
        return;
      }
      await this.refreshAllStatuses(false);
      this.statusTimer = this.setTimeout(run, this.activePollMs);
    };
    this.statusTimer = this.setTimeout(run, this.activePollMs);
  }

  startDetailsLoop() {
    const run = async () => {
      if (this.stopped) {
        return;
      }
      await Promise.allSettled([...this.devices.values()].map((device) => this.refreshDeviceDetails(device)));
      await this.refreshTimers();
      this.detailTimer = this.setTimeout(run, this.detailsPollMs);
    };
    void run();
  }

  startLongPolling() {
    const run = async () => {
      if (this.stopped) {
        return;
      }
      this.longPollController = new AbortController();
      try {
        const response = await this.client.get(this.services.deviceList, {
          params: { lp: this.serverRevision || 1 },
          timeout: 65000,
          signal: this.longPollController.signal,
        });
        if (!this.stopped) {
          await this.refreshDevices(response.data);
        }
      } catch (error) {
        if (!this.stopped && (!axios.isAxiosError(error) || error.code !== "ERR_CANCELED")) {
          await this.handleRequestError("Long polling failed", error, true);
        }
      } finally {
        this.longPollController = null;
      }
      if (!this.stopped) {
        this.longPollTimer = this.setTimeout(run, 250);
      }
    };
    void run();
  }

  scheduleListRefresh() {
    if (this.stopped) {
      return;
    }
    this.listTimer = this.setTimeout(async () => {
      try {
        await this.refreshDevices();
        await this.setStateAsync("info.connection", true, true);
      } catch (error) {
        await this.handleRequestError("Device list refresh failed", error);
      }
      this.scheduleListRefresh();
    }, this.idlePollMs || 30000);
  }

  async onStateChange(id, state) {
    if (!state || state.ack || this.stopped || !this.client) {
      return;
    }
    const relative = id.startsWith(`${this.namespace}.`) ? id.slice(this.namespace.length + 1) : id;
    try {
      if (relative === "timers.refresh") {
        await this.setStateAsync(relative, false, true);
        await this.refreshTimers();
        return;
      }
      if (relative === "timers.createJson") {
        return await this.createTimer(state.val);
      }
      if (relative === "timers.updateJson") {
        return await this.updateTimer(state.val);
      }
      if (relative === "timers.deleteId") {
        return await this.deleteTimer(state.val);
      }

      const [key, ...parts] = relative.split(".");
      const property = parts.join(".");
      const device = [...this.devices.values()].find((item) => item.key === key);
      if (!device) {
        return;
      }
      if (["Setpoint", "Themperatur"].includes(property)) {
        this.requireAccess(device, ACCESS.setpointWrite, "setpoint write");
        const raw = property === "Themperatur" ? Math.round(asNumber(state.val) * 10) : Math.round(asNumber(state.val));
        this.debounceSetpoint(device, raw);
      } else if (property === "Name") {
        this.requireAccess(device, ACCESS.listWrite, "device name write");
        await this.putForm(`${this.services.deviceList}/${device.id}`, { name: String(state.val || "") });
        await this.refreshDevices();
      } else if (property === "flowMax" || property === "setup.flowMax") {
        await this.writeSetup(device, "flowMax", Math.round(asNumber(state.val)));
      } else if (property === "setup.scaldProtection") {
        await this.writeSetup(device, "scaldProtection", Math.round(asNumber(state.val) * 10));
      } else if (property === "setup.sound") {
        await this.writeSetup(device, "sound", state.val ? 1 : 0);
      } else if (property === "setup.loadShedding") {
        await this.writeSetup(device, "loadShedding", Math.round(asNumber(state.val)));
      }
    } catch (error) {
      await this.handleRequestError(`Write failed for ${relative}`, error);
    }
  }

  debounceSetpoint(device, rawValue) {
    const existing = this.setpointTimers.get(device.id);
    if (existing) {
      this.clearTimeout(existing);
    }
    this.setpointTimers.set(
      device.id,
      this.setTimeout(async () => {
        this.setpointTimers.delete(device.id);
        try {
          await this.putForm(`${this.services.deviceSetpoint}/${device.id}`, { data: rawValue });
          await this.refreshStatus(device);
        } catch (error) {
          await this.handleRequestError(`Setpoint write failed for ${device.id}`, error);
        }
      }, 2000),
    );
  }

  async writeSetup(device, name, value) {
    this.requireAccess(device, ACCESS.setupWrite, "setup write");
    if (!this.services.deviceSetup) {
      throw new Error("Device setup service is not available");
    }
    await this.putForm(`${this.services.deviceSetup}/${device.id}`, { [name]: value });
    await this.refreshSetup(device);
    await this.refreshStatus(device);
  }

  async createTimer(value) {
    this.requireTimerWrite();
    const timer = this.parseTimerJson(value, false);
    delete timer.id;
    delete timer.enabled;
    const response = await this.postForm(this.services.timerList, timer);
    await this.setStateAsync("timers.lastResultJson", JSON.stringify(response.data ?? null), true);
    await this.refreshTimers();
    await this.setStateAsync("timers.createJson", "", true);
  }

  async updateTimer(value) {
    this.requireTimerWrite();
    const timer = this.parseTimerJson(value, true);
    const id = timer.id;
    delete timer.id;
    const response = await this.putForm(`${this.services.timerList}/${id}`, timer);
    await this.setStateAsync("timers.lastResultJson", JSON.stringify(response.data ?? null), true);
    await this.refreshTimers();
    await this.setStateAsync("timers.updateJson", "", true);
  }

  async deleteTimer(value) {
    this.requireTimerWrite();
    const id = String(value || "").trim();
    if (!/^\d+$/.test(id)) {
      throw new Error("Timer ID must be numeric");
    }
    const response = await this.client.delete(`${this.services.timerList}/${id}`);
    await this.setStateAsync("timers.lastResultJson", JSON.stringify(response.data ?? null), true);
    await this.refreshTimers();
    await this.setStateAsync("timers.deleteId", "", true);
  }

  parseTimerJson(value, requireId) {
    const input = typeof value === "string" ? JSON.parse(value) : value;
    if (!input || typeof input !== "object") {
      throw new Error("Timer command must be a JSON object");
    }
    if (requireId && !/^\d+$/.test(String(input.id || ""))) {
      throw new Error("Timer update requires a numeric id");
    }
    const allowed = ["id", "enabled", "type", "weekdays", "start", "stop", "deviceId", "setpoint"];
    const result = {};
    for (const key of allowed) {
      if (input[key] !== undefined) {
        result[key] = input[key];
      }
    }
    if (!requireId && (!result.deviceId || result.setpoint === undefined || !result.start || !result.stop)) {
      throw new Error("New timer requires deviceId, setpoint, start and stop");
    }
    return result;
  }

  async putForm(url, data) {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      parameters.set(key, String(value));
    }
    return this.client.put(url, parameters, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  async postForm(url, data) {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      parameters.set(key, String(value));
    }
    return this.client.post(url, parameters, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  can(device, bit) {
    return device.access === undefined || (device.access & (1 << bit)) !== 0;
  }

  anyDeviceCan(bit) {
    return [...this.devices.values()].some((device) => this.can(device, bit));
  }

  requireAccess(device, bit, operation) {
    if (!this.can(device, bit)) {
      throw new Error(`API account is not allowed to perform ${operation} on ${device.id}`);
    }
  }

  requireTimerWrite() {
    if (!this.services.timerList) {
      throw new Error("Timer service is not available");
    }
    if (!this.anyDeviceCan(ACCESS.timerWrite)) {
      throw new Error("API account has no timer write permission");
    }
  }

  async ensureChannel(id, name) {
    await this.extendObjectAsync(id, { type: "channel", common: { name }, native: {} });
  }

  async ensureState(id, name, type, role, read, write, unit = "") {
    const common = { name, type, role, read, write };
    if (unit) {
      common.unit = unit;
    }
    await this.extendObjectAsync(id, { type: "state", common, native: {} });
  }

  async touch() {
    await this.setStateAsync("info.lastUpdate", new Date().toISOString(), true);
  }

  async setError(message) {
    this.log.warn(message);
    await this.setStateAsync("info.lastError", message, true);
    await this.setStateAsync("info.connection", false, true);
  }

  async handleRequestError(prefix, error, keepConnection = false) {
    const status = error && error.response && error.response.status;
    const detail = status ? `HTTP ${status}` : error && error.message ? error.message : String(error);
    const message = `${prefix}: ${detail}`;
    this.log.warn(message);
    await this.setStateAsync("info.lastError", message, true);
    if (!keepConnection || status === 401 || status === 403) {
      await this.setStateAsync("info.connection", false, true);
    }
  }

  onUnload(callback) {
    this.stopped = true;
    for (const timer of [this.statusTimer, this.detailTimer, this.listTimer, this.longPollTimer]) {
      if (timer) {
        this.clearTimeout(timer);
      }
    }
    for (const timer of this.setpointTimers.values()) {
      this.clearTimeout(timer);
    }
    this.setpointTimers.clear();
    if (this.longPollController) {
      this.longPollController.abort();
    }
    callback();
  }
}

if (require.main !== module) {
  module.exports = (options) => new ClageDsx(options);
} else {
  new ClageDsx();
}
