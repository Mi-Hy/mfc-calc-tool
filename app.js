const DATA_FALLBACKS = {
  harvesters: `# Example harvester data. Edit data/harvesters.yml to add measured devices.
- id: workbook-baseline
  name: Workbook baseline harvester
  summary: Matches the default values in mfc_charge_time_calculator.xlsx.
  efficiency: 0.70
  quiescent_power_mw: 0.005
  input_min_v: 0.05
  input_max_v: 4.5
  input_current_max_ma: 110
  storage_voltage_max_v: 4.5
  datasheet_url: ""
  notes: Excel default reference.
- id: low-startup-demo
  name: Low-startup demo harvester
  summary: Example for weak MFC arrays with lower input voltage.
  efficiency: 0.55
  quiescent_power_mw: 0.002
  input_min_v: 0.02
  input_max_v: 3.3
  input_current_max_ma: 25
  storage_voltage_max_v: 3.8
  datasheet_url: ""
  notes: Replace with measured harvester data.
- id: high-efficiency-lab
  name: High-efficiency lab harvester
  summary: Example for a tuned lab setup with better conversion efficiency.
  efficiency: 0.82
  quiescent_power_mw: 0.010
  input_min_v: 0.30
  input_max_v: 5.0
  input_current_max_ma: 150
  storage_voltage_max_v: 5.0
  datasheet_url: ""
  notes: Replace with measured harvester data.
`,
  energySources: `# Example energy buffer data. Edit data/energy_sources.yml with measured leakage values.
- id: workbook-reference-40f
  name: 40 F reference energy buffer
  type: supercap
  technology: EDLC
  summary: Covers the workbook default target plus the default safety margin.
  capacitance_f: 40
  voltage_max_v: 4.2
  voltage_min_v: 0
  leakage_current_ua: 5
  esr_ohm: 0.10
  datasheet_url: ""
  notes: Excel-style reference storage element.
- id: starter-10f
  name: 10 F starter energy buffer
  type: supercap
  technology: EDLC
  summary: Smaller buffer for short duty cycles or reduced energy targets.
  capacitance_f: 10
  voltage_max_v: 5.5
  voltage_min_v: 0
  leakage_current_ua: 8
  esr_ohm: 0.18
  datasheet_url: ""
  notes: Example value, replace with datasheet or measured leakage.
- id: reserve-50f
  name: 50 F reserve energy buffer
  type: supercap
  technology: EDLC
  summary: Larger buffer for slow charging or higher energy payloads.
  capacitance_f: 50
  voltage_max_v: 5.0
  voltage_min_v: 0
  leakage_current_ua: 12
  esr_ohm: 0.08
  datasheet_url: ""
  notes: Example value, replace with datasheet or measured leakage.
`,
  converters: `# Optional DC-DC converter data for the stage after the energy buffer.
- id: regulated-3v3-efficient
  name: Regulated 3.3 V efficient converter
  summary: Example buck-boost stage for 3.3 V electronics.
  output_voltage_v: 3.3
  efficiency: 0.88
  quiescent_power_mw: 0.006
  input_min_v: 0.9
  input_max_v: 5.5
  output_current_max_ma: 100
  datasheet_url: ""
  notes: Replace with measured converter data.
- id: regulated-5v-lowpower
  name: Regulated 5 V low-power converter
  summary: Example boost stage for 5 V payloads.
  output_voltage_v: 5.0
  efficiency: 0.78
  quiescent_power_mw: 0.015
  input_min_v: 1.8
  input_max_v: 5.5
  output_current_max_ma: 60
  datasheet_url: ""
  notes: Replace with measured converter data.
`
};

const DATA_PATHS = {
  harvesters: "data/harvesters.yml",
  energySources: "data/energy_sources.yml",
  converters: "data/converters.yml"
};

const EMPTY_TECHNOLOGY_FILTER = "__empty_technology__";

const state = {
  harvesters: [],
  energySources: [],
  converters: [],
  selectedHarvesterId: "",
  selectedEnergySourceId: "",
  selectedConverterId: "",
  energyTechnologyFilter: "",
  converterEnabled: false,
  usedFallback: false,
  inputs: {
    targetEnergyJ: 150,
    initialEnergyJ: 0,
    usableStoragePercent: 100,
    safetyMarginPercent: 10,
    desiredChargeTimeH: 48,
    otherLoadMw: 0,
    mfcPowerMw: 0.05,
    mfcVoltageV: 0.5,
    declaredMfcCount: 30,
    seriesCount: 6,
    parallelCount: 5,
    availabilityPercent: 100,
    deratingPercent: 100,
    loadVmin: 3,
    loadVmax: 5
  }
};

const els = {
  dataStatus: document.getElementById("data-status"),
  harvesterOptions: document.getElementById("harvester-options"),
  energySourceOptions: document.getElementById("energy-source-options"),
  energyBufferFilter: document.getElementById("energy-buffer-filter"),
  energyBufferFilterStatus: document.getElementById("energy-buffer-filter-status"),
  energyBufferEmpty: document.getElementById("energy-buffer-empty"),
  converterOptions: document.getElementById("converter-options"),
  converterSelector: document.getElementById("converter-selector"),
  converterEnabled: document.getElementById("converter-enabled"),
  resultSummary: document.getElementById("result-summary"),
  overallStatus: document.getElementById("overall-status"),
  overallMessage: document.getElementById("overall-message"),
  metricChargeTime: document.getElementById("metric-charge-time"),
  metricNetPower: document.getElementById("metric-net-power"),
  metricStoredEnergy: document.getElementById("metric-stored-energy"),
  metricRequiredStorage: document.getElementById("metric-required-storage"),
  computedValues: document.getElementById("computed-values"),
  checksList: document.getElementById("checks-list"),
  flowArray: document.getElementById("flow-array"),
  flowHarvester: document.getElementById("flow-harvester"),
  flowEnergySource: document.getElementById("flow-energy-source"),
  flowConverter: document.getElementById("flow-converter"),
  flowLoad: document.getElementById("flow-load"),
  flowDcStep: document.getElementById("flow-dc-step"),
  flowDcLink: document.getElementById("flow-dc-link")
};

function stripInlineComment(line) {
  let quote = "";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if ((char === "\"" || char === "'") && line[i - 1] !== "\\") {
      quote = quote === char ? "" : quote || char;
    }
    if (char === "#" && !quote && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line.trimEnd();
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(trimmed)) {
    return numeric;
  }
  return trimmed;
}

function parseYamlList(text) {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const items = [];
  let current = null;

  rows.forEach((rawLine) => {
    const withoutComment = stripInlineComment(rawLine);
    if (!withoutComment.trim()) return;
    const line = withoutComment.trim();

    if (line.startsWith("- ")) {
      if (current) items.push(current);
      current = {};
      const rest = line.slice(2).trim();
      if (rest) {
        const index = rest.indexOf(":");
        if (index > -1) {
          current[rest.slice(0, index).trim()] = parseScalar(rest.slice(index + 1));
        }
      }
      return;
    }

    if (!current) return;
    const index = line.indexOf(":");
    if (index === -1) return;
    current[line.slice(0, index).trim()] = parseScalar(line.slice(index + 1));
  });

  if (current) items.push(current);
  return items;
}

async function loadYamlList(kind) {
  try {
    const response = await fetch(DATA_PATHS[kind], { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return parseYamlList(await response.text());
  } catch (error) {
    state.usedFallback = true;
    return parseYamlList(DATA_FALLBACKS[kind]);
  }
}

function numberValue(name) {
  const value = Number(state.inputs[name]);
  return Number.isFinite(value) ? value : 0;
}

function clampPercent(name) {
  return Math.max(0, numberValue(name)) / 100;
}

function selectedItem(items, id) {
  return items.find((item) => item.id === id) || items[0] || {};
}

function finiteOr(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  if (Math.abs(value) >= 1) return value.toFixed(digits);
  if (Math.abs(value) >= 0.01) return value.toFixed(3);
  if (value === 0) return "0";
  return value.toExponential(2);
}

function fmtUnit(value, unit, digits = 2) {
  return `${fmt(value, digits)} ${unit}`;
}

function percent(value) {
  return `${fmt(value * 100, 0)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function safeDatasheetUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function cardFacts(item, kind) {
  if (kind === "harvester") {
    return [
      ["Efficiency", percent(finiteOr(item.efficiency))],
      ["Input", `${fmt(finiteOr(item.input_min_v))}-${fmt(finiteOr(item.input_max_v))} V`],
      ["Max current", fmtUnit(finiteOr(item.input_current_max_ma), "mA", 1)],
      ["Quiescent", fmtUnit(finiteOr(item.quiescent_power_mw), "mW", 3)]
    ];
  }
  if (kind === "energy-source") {
    return [
      ["Type", item.type || "-"],
      ["Technology", item.technology || "-"],
      ["Storage size", fmtUnit(finiteOr(item.capacitance_f), "F", 1)],
      ["Vmax", fmtUnit(finiteOr(item.voltage_max_v), "V", 1)],
      ["Leakage", fmtUnit(finiteOr(item.leakage_current_ua), "uA", 1)],
      ["ESR", fmtUnit(finiteOr(item.esr_ohm), "ohm", 2)]
    ];
  }
  return [
    ["Output", fmtUnit(finiteOr(item.output_voltage_v), "V", 1)],
    ["Efficiency", percent(finiteOr(item.efficiency))],
    ["Input", `${fmt(finiteOr(item.input_min_v))}-${fmt(finiteOr(item.input_max_v))} V`],
    ["Iq power", fmtUnit(finiteOr(item.quiescent_power_mw), "mW", 3)]
  ];
}

function renderCards(container, items, selectedId, kind) {
  container.innerHTML = items.map((item) => {
    const facts = cardFacts(item, kind).map(([label, value]) => `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `).join("");
    const selected = item.id === selectedId ? " is-selected" : "";
    const datasheetUrl = safeDatasheetUrl(item.datasheet_url);
    const datasheetLink = datasheetUrl
      ? `<a class="datasheet-link" href="${escapeHtml(datasheetUrl)}" target="_blank" rel="noreferrer">Datasheet</a>`
      : "";
    return `
      <div class="option-card${selected}">
        <button class="option-select" type="button" data-kind="${kind}" data-id="${escapeHtml(item.id)}">
          <span class="option-title">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${selected ? "Selected" : "Pick"}</span>
          </span>
          <p>${escapeHtml(item.summary || item.notes || "")}</p>
          <dl class="option-facts">${facts}</dl>
        </button>
        ${datasheetLink}
      </div>
    `;
  }).join("");
}

function filteredEnergySources() {
  if (!state.energyTechnologyFilter) return state.energySources;
  return state.energySources.filter((item) => {
    const technology = String(item.technology ?? "").trim();
    if (state.energyTechnologyFilter === EMPTY_TECHNOLOGY_FILTER) return !technology;
    return technology === state.energyTechnologyFilter;
  });
}

function renderEnergyTechnologyFilter() {
  const technologyOptions = new Map();
  state.energySources.forEach((item) => {
    const technology = String(item.technology ?? "").trim();
    technologyOptions.set(technology || EMPTY_TECHNOLOGY_FILTER, technology || "Unspecified");
  });

  const options = [
    ["", "All technologies"],
    ...Array.from(technologyOptions.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  ];

  els.energyBufferFilter.innerHTML = options.map(([value, label]) => `
    <option value="${escapeHtml(value)}">${escapeHtml(label)}</option>
  `).join("");
  els.energyBufferFilter.value = state.energyTechnologyFilter;
}

function readInputsFromDom() {
  document.querySelectorAll("[data-input]").forEach((input) => {
    state.inputs[input.dataset.input] = Number(input.value);
  });
}

function calculate() {
  const harvester = selectedItem(state.harvesters, state.selectedHarvesterId);
  const energySource = selectedItem(state.energySources, state.selectedEnergySourceId);
  const converter = selectedItem(state.converters, state.selectedConverterId);
  const converterOn = Boolean(state.converterEnabled && converter.id);

  const targetEnergyJ = Math.max(0, numberValue("targetEnergyJ"));
  const initialEnergyJ = Math.max(0, numberValue("initialEnergyJ"));
  const usableStorageFraction = Math.max(0.01, clampPercent("usableStoragePercent"));
  const safetyMargin = Math.max(0, clampPercent("safetyMarginPercent"));
  const desiredChargeTimeH = Math.max(0, numberValue("desiredChargeTimeH"));
  const otherLoadMw = Math.max(0, numberValue("otherLoadMw"));
  const mfcPowerMw = Math.max(0, numberValue("mfcPowerMw"));
  const mfcVoltageV = Math.max(0, numberValue("mfcVoltageV"));
  const declaredMfcCount = Math.max(0, Math.round(numberValue("declaredMfcCount")));
  const seriesCount = Math.max(1, Math.round(numberValue("seriesCount")));
  const parallelCount = Math.max(1, Math.round(numberValue("parallelCount")));
  const availability = Math.max(0, clampPercent("availabilityPercent"));
  const derating = Math.max(0, clampPercent("deratingPercent"));
  const loadVmin = Math.max(0, numberValue("loadVmin"));
  const loadVmax = Math.max(loadVmin, numberValue("loadVmax"));

  const hEfficiency = Math.max(0, finiteOr(harvester.efficiency));
  const hQuiescentMw = Math.max(0, finiteOr(harvester.quiescent_power_mw));
  const hInputMinV = Math.max(0, finiteOr(harvester.input_min_v));
  const hInputMaxV = Math.max(hInputMinV, finiteOr(harvester.input_max_v));
  const hInputMaxCurrentMa = Math.max(0, finiteOr(harvester.input_current_max_ma));
  const hStorageMaxV = Math.max(0, finiteOr(harvester.storage_voltage_max_v, Infinity));

  const capF = Math.max(0, finiteOr(energySource.capacitance_f));
  const capVminRated = Math.max(0, finiteOr(energySource.voltage_min_v));
  const capVmaxRated = Math.max(capVminRated, finiteOr(energySource.voltage_max_v));
  const leakageCurrentUa = Math.max(0, finiteOr(energySource.leakage_current_ua));

  const dcEfficiency = converterOn ? Math.max(0.01, finiteOr(converter.efficiency, 1)) : 1;
  const dcInputMinV = converterOn ? Math.max(0, finiteOr(converter.input_min_v)) : 0;
  const dcInputMaxV = converterOn ? Math.max(dcInputMinV, finiteOr(converter.input_max_v, Infinity)) : Infinity;
  const dcOutputV = converterOn ? Math.max(0, finiteOr(converter.output_voltage_v)) : 0;
  const dcQuiescentMw = converterOn ? Math.max(0, finiteOr(converter.quiescent_power_mw)) : 0;

  const configuredMfcCount = seriesCount * parallelCount;
  const arrayVoltageV = seriesCount * mfcVoltageV;
  const singleMfcCurrentMa = mfcVoltageV > 0 ? mfcPowerMw / mfcVoltageV : 0;
  const arrayCurrentMa = parallelCount * singleMfcCurrentMa;
  const arrayPowerMw = configuredMfcCount * mfcPowerMw;

  const capVoltageCeilingV = Math.min(capVmaxRated, hStorageMaxV, dcInputMaxV, converterOn ? Infinity : loadVmax);
  const capVoltageFloorV = Math.max(capVminRated, converterOn ? dcInputMinV : loadVmin);
  const voltageWindowValid = capVoltageCeilingV > capVoltageFloorV;
  const capStoredWindowJ = voltageWindowValid
    ? 0.5 * capF * (capVoltageCeilingV ** 2 - capVoltageFloorV ** 2)
    : 0;
  const capDeliverableEnergyJ = capStoredWindowJ * usableStorageFraction * dcEfficiency;

  const capEnergyNeededBeforeMarginJ = Math.max(0, targetEnergyJ / (usableStorageFraction * dcEfficiency) - initialEnergyJ);
  const adjustedCapEnergyToAddJ = capEnergyNeededBeforeMarginJ * (1 + safetyMargin);
  const requiredCapacitanceF = voltageWindowValid
    ? (2 * capEnergyNeededBeforeMarginJ) / (capVoltageCeilingV ** 2 - capVoltageFloorV ** 2)
    : Infinity;
  const requiredCapacitanceWithMarginF = voltageWindowValid
    ? (2 * adjustedCapEnergyToAddJ) / (capVoltageCeilingV ** 2 - capVoltageFloorV ** 2)
    : Infinity;
  const targetWithMarginLoadJ = targetEnergyJ * (1 + safetyMargin);
  const capSufficient = capDeliverableEnergyJ >= targetWithMarginLoadJ;

  const storageLeakageMw = leakageCurrentUa * capVoltageCeilingV / 1000;
  const otherLoadAtStorageMw = converterOn ? otherLoadMw / dcEfficiency : otherLoadMw;
  const grossChargeMw = arrayPowerMw * hEfficiency * availability * derating;
  const lossesMw = hQuiescentMw + storageLeakageMw + dcQuiescentMw + otherLoadAtStorageMw;
  const netChargeMw = Math.max(0, grossChargeMw - lossesMw);
  const chargeTimeH = netChargeMw > 0 ? adjustedCapEnergyToAddJ / (netChargeMw / 1000) / 3600 : Infinity;
  const energyAddedPerDayCapJ = netChargeMw / 1000 * 86400;
  const energyAddedPerDayLoadJ = energyAddedPerDayCapJ * usableStorageFraction * dcEfficiency;

  const desiredTimeValid = desiredChargeTimeH > 0;
  const feasibleWithinTime = desiredTimeValid && chargeTimeH <= desiredChargeTimeH;
  const requiredNetPowerMw = desiredTimeValid ? adjustedCapEnergyToAddJ / (desiredChargeTimeH * 3600) * 1000 : Infinity;
  const deratedConversion = hEfficiency * availability * derating;
  const requiredArrayPowerMw = deratedConversion > 0 ? (requiredNetPowerMw + lossesMw) / deratedConversion : Infinity;
  const requiredMfcCount = mfcPowerMw > 0 && Number.isFinite(requiredArrayPowerMw) ? Math.ceil(requiredArrayPowerMw / mfcPowerMw) : Infinity;
  const requiredParallelStrings = Number.isFinite(requiredMfcCount) ? Math.ceil(requiredMfcCount / seriesCount) : Infinity;

  const checks = [
    {
      ok: declaredMfcCount === configuredMfcCount,
      text: `Declared MFC count ${declaredMfcCount} matches series x parallel count ${configuredMfcCount}.`
    },
    {
      ok: arrayVoltageV >= hInputMinV && arrayVoltageV <= hInputMaxV,
      text: `Array MPP voltage ${fmtUnit(arrayVoltageV, "V")} is inside harvester input window ${fmt(hInputMinV)}-${fmt(hInputMaxV)} V.`
    },
    {
      ok: arrayCurrentMa <= hInputMaxCurrentMa,
      text: `Array MPP current ${fmtUnit(arrayCurrentMa, "mA")} is below harvester limit ${fmtUnit(hInputMaxCurrentMa, "mA")}.`
    },
    {
      ok: capVmaxRated <= hStorageMaxV,
      text: `Energy buffer Vmax ${fmtUnit(capVmaxRated, "V")} is compatible with harvester storage limit ${fmtUnit(hStorageMaxV, "V")}.`
    },
    {
      ok: voltageWindowValid,
      text: `Usable storage window is ${fmt(capVoltageFloorV)}-${fmt(capVoltageCeilingV)} V.`
    },
    {
      ok: capSufficient,
      text: `Selected energy buffer can deliver ${fmtUnit(capDeliverableEnergyJ, "J")} versus target plus margin ${fmtUnit(targetWithMarginLoadJ, "J")}.`
    },
    {
      ok: netChargeMw > 0,
      text: `Net charging power is positive after ${fmtUnit(lossesMw, "mW")} of losses.`
    },
    {
      ok: feasibleWithinTime,
      text: `Charge time ${Number.isFinite(chargeTimeH) ? fmtUnit(chargeTimeH, "h") : "not available"} is within desired ${fmtUnit(desiredChargeTimeH, "h")}.`
    }
  ];

  if (converterOn) {
    checks.splice(5, 0, {
      ok: dcOutputV >= loadVmin && dcOutputV <= loadVmax,
      text: `DC-DC output ${fmtUnit(dcOutputV, "V")} is inside load window ${fmt(loadVmin)}-${fmt(loadVmax)} V.`
    });
  }

  const allCriticalOk = checks.every((check) => check.ok);

  return {
    harvester,
    energySource,
    converter,
    converterOn,
    configuredMfcCount,
    arrayVoltageV,
    singleMfcCurrentMa,
    arrayCurrentMa,
    arrayPowerMw,
    capVoltageFloorV,
    capVoltageCeilingV,
    capStoredWindowJ,
    capDeliverableEnergyJ,
    adjustedCapEnergyToAddJ,
    requiredCapacitanceF,
    requiredCapacitanceWithMarginF,
    grossChargeMw,
    lossesMw,
    netChargeMw,
    chargeTimeH,
    energyAddedPerDayCapJ,
    energyAddedPerDayLoadJ,
    requiredNetPowerMw,
    requiredArrayPowerMw,
    requiredMfcCount,
    requiredParallelStrings,
    capSufficient,
    feasibleWithinTime,
    allCriticalOk,
    checks
  };
}

function renderComputedValues(result) {
  const values = [
    ["Configured MFC count", `${result.configuredMfcCount} pcs`],
    ["Array MPP voltage", fmtUnit(result.arrayVoltageV, "V")],
    ["Array MPP current", fmtUnit(result.arrayCurrentMa, "mA")],
    ["Array MPP power", fmtUnit(result.arrayPowerMw, "mW")],
    ["Gross harvested power", fmtUnit(result.grossChargeMw, "mW")],
    ["Total losses while charging", fmtUnit(result.lossesMw, "mW")],
    ["Energy to add to storage", fmtUnit(result.adjustedCapEnergyToAddJ, "J")],
    ["Required storage size incl margin", fmtUnit(result.requiredCapacitanceWithMarginF, "F")],
    ["Energy added per day", `${fmtUnit(result.energyAddedPerDayLoadJ, "J/day")} load side`],
    ["Required net power", fmtUnit(result.requiredNetPowerMw, "mW")],
    ["Required MFC count", Number.isFinite(result.requiredMfcCount) ? `${result.requiredMfcCount} pcs` : "-"],
    ["Minimum parallel strings", Number.isFinite(result.requiredParallelStrings) ? `${result.requiredParallelStrings} strings` : "-"]
  ];

  els.computedValues.innerHTML = values.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function renderChecks(result) {
  els.checksList.innerHTML = result.checks.map((check) => `
    <li class="${check.ok ? "check-ok" : "check-bad"}">
      <span class="check-dot" aria-hidden="true"></span>
      <span>${escapeHtml(check.text)}</span>
    </li>
  `).join("");
}

function renderResults() {
  const result = calculate();
  const statusClass = result.allCriticalOk ? "is-ok" : result.netChargeMw > 0 ? "is-warn" : "is-bad";
  const status = result.allCriticalOk ? "Sufficient" : "Not sufficient";
  const message = result.allCriticalOk
    ? `The selected energy buffer ${result.energySource.name} and harvester ${result.harvester.name} meet the energy, voltage, and time checks.`
    : "At least one capacity, timing, voltage, current, or count check fails for this setup.";

  els.resultSummary.className = `result-summary ${statusClass}`;
  els.overallStatus.textContent = status;
  els.overallMessage.textContent = message;
  els.metricChargeTime.textContent = Number.isFinite(result.chargeTimeH) ? `${fmt(result.chargeTimeH)} h` : "-";
  els.metricNetPower.textContent = fmtUnit(result.netChargeMw, "mW");
  els.metricStoredEnergy.textContent = fmtUnit(result.capDeliverableEnergyJ, "J");
  els.metricRequiredStorage.textContent = fmtUnit(result.requiredCapacitanceF, "F");

  els.flowArray.textContent = `${result.configuredMfcCount} cells, ${fmtUnit(result.arrayPowerMw, "mW")}`;
  els.flowHarvester.textContent = result.harvester.name || "No harvester";
  els.flowEnergySource.textContent = result.energySource.name || "No energy buffer";
  els.flowConverter.textContent = result.converterOn ? `${result.converter.name}, ${fmtUnit(finiteOr(result.converter.output_voltage_v), "V")}` : "Bypassed";
  els.flowLoad.textContent = `${fmtUnit(numberValue("targetEnergyJ"), "J")} in ${fmtUnit(numberValue("desiredChargeTimeH"), "h")}`;
  els.flowDcStep.classList.toggle("is-muted", !result.converterOn);
  els.flowDcLink.classList.toggle("is-muted", !result.converterOn);

  renderComputedValues(result);
  renderChecks(result);
}

function renderSelections() {
  if (state.energyTechnologyFilter && !filteredEnergySources().length) {
    state.energyTechnologyFilter = "";
  }
  const visibleEnergySources = filteredEnergySources();
  renderCards(els.harvesterOptions, state.harvesters, state.selectedHarvesterId, "harvester");
  renderCards(els.energySourceOptions, visibleEnergySources, state.selectedEnergySourceId, "energy-source");
  renderCards(els.converterOptions, state.converters, state.selectedConverterId, "converter");
  renderEnergyTechnologyFilter();
  els.energyBufferFilterStatus.textContent = state.energyTechnologyFilter
    ? `Showing ${visibleEnergySources.length} of ${state.energySources.length} energy buffers.`
    : `${state.energySources.length} energy buffers available.`;
  els.energyBufferEmpty.classList.toggle("is-hidden", visibleEnergySources.length > 0);
  els.converterSelector.classList.toggle("is-hidden", !state.converterEnabled);
  els.converterEnabled.checked = state.converterEnabled;
}

function render() {
  renderSelections();
  renderResults();
}

function bindEvents() {
  document.querySelectorAll("[data-input]").forEach((input) => {
    input.addEventListener("input", () => {
      readInputsFromDom();
      renderResults();
    });
  });

  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-kind][data-id]");
    if (!card) return;
    const { kind, id } = card.dataset;
    if (kind === "harvester") state.selectedHarvesterId = id;
    if (kind === "energy-source") state.selectedEnergySourceId = id;
    if (kind === "converter") state.selectedConverterId = id;
    render();
  });

  els.converterEnabled.addEventListener("change", () => {
    state.converterEnabled = els.converterEnabled.checked;
    render();
  });

  els.energyBufferFilter.addEventListener("change", () => {
    state.energyTechnologyFilter = els.energyBufferFilter.value;
    const visibleEnergySources = filteredEnergySources();
    if (visibleEnergySources.length && !visibleEnergySources.some((item) => item.id === state.selectedEnergySourceId)) {
      state.selectedEnergySourceId = visibleEnergySources[0].id;
    }
    render();
  });
}

async function init() {
  const [harvesters, energySources, converters] = await Promise.all([
    loadYamlList("harvesters"),
    loadYamlList("energySources"),
    loadYamlList("converters")
  ]);

  state.harvesters = harvesters;
  state.energySources = energySources;
  state.converters = converters;
  state.selectedHarvesterId = harvesters[0]?.id || "";
  state.selectedEnergySourceId = energySources[0]?.id || "";
  state.selectedConverterId = converters[0]?.id || "";

  els.dataStatus.textContent = state.usedFallback
    ? "Using built-in example data because YAML files could not be fetched. Serve the folder over HTTP to load YAML edits."
    : "Loaded hardware options from YAML files.";

  readInputsFromDom();
  bindEvents();
  render();
}

init();
