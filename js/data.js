/* CAS parsing and processed portfolio state, adapted from the original dashboard.
 * PDF bytes and passwords never enter browser storage. Modules load only on upload.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "wealth-dashboard.portfolio.v1";
  const vendorUrl = path => new URL("js/vendor/" + path, document.baseURI).href;
  const config = {
  "portfolio": {
    "pdfjsUrl": vendorUrl("pdf.mjs"),
    "pdfjsWorkerUrl": vendorUrl("pdf.worker.mjs"),
    "casparserUrl": vendorUrl("casparser.mjs"),
    "excludeFolios": []
  },
  "education": {
    "child": "Aditya",
    "goals": [
      {
        "id": "coaching",
        "label": "Coaching",
        "icon": "📚",
        "target": 300000,
        "folios": []
      },
      {
        "id": "engineering",
        "label": "Engineering",
        "icon": "🎓",
        "target": 1000000,
        "folios": [
          "910173588532",
          "10436514",
          "31053408156",
          "3108927855",
          "91014764571",
          "910173588622",
          "10541177",
          "31053433806",
          "3107751004",
          "51022869212",
          "3109119204"
        ]
      },
      {
        "id": "marriage",
        "label": "Marriage",
        "icon": "💍",
        "target": 200000,
        "folios": []
      }
    ]
  },
  "family": {
    "people": [
      {
        "id": "sandeep",
        "label": "Sandeep",
        "icon": "🧑",
        "aliases": [],
        "folios": []
      },
      {
        "id": "riya",
        "label": "Riya",
        "icon": "👩",
        "aliases": [],
        "folios": [
          "3109119204"
        ]
      }
    ],
    "purposes": [
      {
        "id": "retirement",
        "label": "Retirement",
        "icon": "📈",
        "target": 3000000,
        "folios": []
      }
    ],
    "portfolioTarget": 3000000
  },
  "liquid": {
    "heading": "Surplus amount",
    "target": 0,
    "folios": [
      "1002055178"
    ]
  }
};
  const portfolioConfig = config.portfolio;
  const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const PLAN_SUFFIX_PATTERN = /\s*[-\u2013]?\s*\b(?:Direct|Regular)\b.*$/i;
  const DEMAT_SUFFIX_PATTERN = /\s*[-\u2013]?\s*\(?\s*(?:Non[\s-]?Demat|Demat)\s*\)?\s*$/i;
  const EDGE_TRIM_PATTERN = /^[\s\u2013-]+|[\s\u2013-]+$/g;

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  if (typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildValidDate(year, monthIndex, day) {
  const candidate = new Date(year, monthIndex, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== monthIndex || candidate.getDate() !== day) {
    return null;
  }
  return candidate;
}

function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !value) {
    return null;
  }
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return buildValidDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const monthIndex = MONTH_INDEX[match[2].toLowerCase()];
    if (monthIndex !== undefined) {
      return buildValidDate(Number(match[3]), monthIndex, Number(match[1]));
    }
  }
  match = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) {
    return buildValidDate(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }
  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return buildValidDate(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }
  return null;
}

function titleCase(text) {
  return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function investedFromTransactions(transactions) {
  let invested = 0;
  for (const transaction of transactions || []) {
    const units = toNumber(transaction.units);
    const amount = toNumber(transaction.amount);
    if (units > 0) {
      invested += amount;
    } else if (units < 0) {
      invested -= Math.abs(amount);
    }
  }
  return Math.max(invested, 0);
}

function shortFundName(name) {
  let trimmed = name.replace(PLAN_SUFFIX_PATTERN, "");
  trimmed = trimmed.replace(DEMAT_SUFFIX_PATTERN, "").replace(EDGE_TRIM_PATTERN, "");
  return trimmed || name;
}

function buildPortfolio(raw) {
  const schemes = [];
  let totalInvested = 0;
  let totalCurrent = 0;
  const categoryValues = {};
  const amcValues = {};
  let valuationDate = null;
  const owners = [];
  const defaultOwner = (raw.investor_info || {}).name || "";
  const excludedFolios = new Set((portfolioConfig.excludeFolios || []).map(normalizeFolio).filter(Boolean));

  for (const folio of raw.folios || []) {
    if (excludedFolios.has(normalizeFolio(folio.folio))) {
      continue;
    }
    const amc = folio.amc || "";
    const owner = folio.owner || defaultOwner;
    if (owner && !owners.includes(owner)) {
      owners.push(owner);
    }
    for (const scheme of folio.schemes || []) {
      const valuation = scheme.valuation || {};
      const currentValue = toNumber(valuation.value);
      let invested = toNumber(valuation.cost);
      if (invested <= 0) {
        invested = investedFromTransactions(scheme.transactions || []);
      }
      const units = toNumber(scheme.close);
      if (units <= 0 && currentValue <= 0) {
        continue;
      }
      const category = titleCase(String(scheme.type || "").trim() || "Other");
      const schemeDate = toDate(valuation.date);
      if (schemeDate && (valuationDate === null || schemeDate > valuationDate)) {
        valuationDate = schemeDate;
      }

      schemes.push({
        name: scheme.scheme || "Unknown scheme",
        amc,
        folio: folio.folio,
        owner,
        category,
        units,
        invested,
        current: currentValue,
        gain: currentValue - invested,
      });
      totalInvested += invested;
      totalCurrent += currentValue;
      categoryValues[category] = (categoryValues[category] || 0) + currentValue;
      if (amc) {
        amcValues[amc] = (amcValues[amc] || 0) + currentValue;
      }
    }
  }

  const statementDate = toDate((raw.statement_period || {}).to);
  if (statementDate) {
    valuationDate = statementDate;
  }

  schemes.sort((first, second) => second.current - first.current);
  return {
    investor: raw.investor_info || {},
    period: raw.statement_period || {},
    schemes,
    total_invested: totalInvested,
    total_current: totalCurrent,
    total_gain: totalCurrent - totalInvested,
    category_values: categoryValues,
    amc_values: amcValues,
    owners,
    valuation_date: valuationDate,
  };
}

function mergeStatements(statements) {
  const merged = { investor_info: {}, statement_period: {}, folios: [] };
  const owners = [];
  let latestPeriodTo = null;
  for (const { data, label } of statements) {
    const owner = (data.investor_info && data.investor_info.name) || label;
    owners.push(owner);
    const periodTo = toDate((data.statement_period || {}).to);
    if (periodTo && (latestPeriodTo === null || periodTo > latestPeriodTo)) {
      latestPeriodTo = periodTo;
      merged.statement_period = { ...data.statement_period };
    }
    for (const folio of data.folios || []) {
      merged.folios.push({ ...folio, owner });
    }
  }
  const uniqueOwners = [...new Set(owners)];
  if (uniqueOwners.length) {
    merged.investor_info = { name: uniqueOwners.join(" + ") };
  }
  return merged;
}

function portfolioFromSchemes(base, schemes) {
  let totalInvested = 0;
  let totalCurrent = 0;
  const categoryValues = {};
  const amcValues = {};
  const presentOwners = new Set();
  for (const scheme of schemes) {
    totalInvested += scheme.invested;
    totalCurrent += scheme.current;
    categoryValues[scheme.category] = (categoryValues[scheme.category] || 0) + scheme.current;
    if (scheme.amc) {
      amcValues[scheme.amc] = (amcValues[scheme.amc] || 0) + scheme.current;
    }
    if (scheme.owner) {
      presentOwners.add(scheme.owner);
    }
  }
  return {
    investor: base.investor,
    period: base.period,
    schemes,
    total_invested: totalInvested,
    total_current: totalCurrent,
    total_gain: totalCurrent - totalInvested,
    category_values: categoryValues,
    amc_values: amcValues,
    owners: base.owners.filter((owner) => presentOwners.has(owner)),
    valuation_date: base.valuation_date,
  };
}

// CAS folios look like "10436514 / 21"; match on the base number before the slash.
function normalizeFolio(value) {
  return String(value || "").split("/")[0].replace(/\s/g, "");
}

const educationGoals = config.education.goals || [];
const familyPeople = config.family.people || [];
const familyPurposes = config.family.purposes || [];
const educationFolios = new Set(educationGoals.flatMap(goal => goal.folios || []).map(normalizeFolio));
const liquidFolios = new Set((config.liquid.folios || []).map(normalizeFolio));
const folioToGoalId = new Map();
const folioToPurpose = new Map();
const folioToPersonId = new Map();
for (const goal of educationGoals) {
  for (const folio of goal.folios || []) {
    const key = normalizeFolio(folio);
    folioToGoalId.set(key, goal.id);
    folioToPurpose.set(key, { id: goal.id, label: goal.label || goal.id,
      parentLabel: config.education.child || "Aditya", icon: goal.icon || "🎯", general: false });
  }
}
for (const purpose of familyPurposes) {
  for (const folio of purpose.folios || []) {
    const key = normalizeFolio(folio);
    if (!folioToPurpose.has(key)) {
      folioToPurpose.set(key, { id: purpose.id, label: purpose.label || purpose.id,
        parentLabel: "", icon: purpose.icon || "🏷️", general: false });
    }
  }
}
for (const person of familyPeople) {
  for (const folio of person.folios || []) folioToPersonId.set(normalizeFolio(folio), person.id);
}

function personForScheme(scheme) {
  const mappedId = folioToPersonId.get(normalizeFolio(scheme.folio));
  if (mappedId) {
    const match = familyPeople.find((person) => person.id === mappedId);
    if (match) {
      return { id: match.id, label: match.label || match.id, icon: match.icon || "👤" };
    }
  }
  const owner = String(scheme.owner || "").trim();
  const ownerLower = owner.toLowerCase();
  if (ownerLower) {
    for (const person of familyPeople) {
      const aliases = [person.label || "", ...(person.aliases || [])]
        .map((alias) => String(alias).trim().toLowerCase())
        .filter(Boolean);
      if (aliases.some((alias) => ownerLower.includes(alias))) {
        return { id: person.id, label: person.label || person.id, icon: person.icon || "👤" };
      }
    }
  }
  return { id: "owner:" + (ownerLower || "unassigned"), label: owner || "Unassigned", icon: "👤" };
}

function annotateScheme(scheme) {
  const key = normalizeFolio(scheme.folio);
  return Object.assign(scheme, {
    education: educationFolios.has(key),
    liquid: liquidFolios.has(key),
    goalId: folioToGoalId.get(key) || null,
    purpose: folioToPurpose.get(key) || { id: "portfolio", label: "Portfolio", parentLabel: "", icon: "💼", general: true },
    person: personForScheme(scheme),
  });
}

function finiteNumber(value) {
  const number = toNumber(value);
  return Number.isFinite(number) ? number : 0;
}

// Whitelist the processed model: caller-supplied raw data and credentials are discarded.
function processedPortfolio(portfolio) {
  if (!portfolio || !Array.isArray(portfolio.schemes)) throw new Error("Invalid portfolio data.");
  const schemes = portfolio.schemes.map(scheme => {
    const invested = finiteNumber(scheme.invested);
    const current = finiteNumber(scheme.current);
    return annotateScheme({
      name: String(scheme.name || "Unknown scheme"),
      amc: String(scheme.amc || ""),
      folio: String(scheme.folio || ""),
      owner: String(scheme.owner || ""),
      category: String(scheme.category || "Other"),
      units: finiteNumber(scheme.units), invested, current, gain: current - invested,
    });
  });
  const sourceDate = portfolio.valuation_date;
  const date = sourceDate instanceof Date ? sourceDate : sourceDate ? new Date(sourceDate) : null;
  const owners = [...new Set(schemes.map(scheme => scheme.owner).filter(Boolean))];
  const base = {
    investor: { name: String((portfolio.investor || {}).name || owners.join(" + ")) },
    period: { from: String((portfolio.period || {}).from || ""), to: String((portfolio.period || {}).to || "") },
    owners, valuation_date: date && !Number.isNaN(date.getTime()) ? date : null,
  };
  return portfolioFromSchemes(base, schemes);
}

let backendPromise;
function getPdfBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      const pdfjs = await import(portfolioConfig.pdfjsUrl);
      const parser = await import(portfolioConfig.casparserUrl);
      pdfjs.GlobalWorkerOptions.workerSrc = portfolioConfig.pdfjsWorkerUrl;
      parser.setPdfBackend(parser.createPdfjsBackend(pdfjs, {
        documentOptions: {
          cMapUrl: vendorUrl("cmaps/"),
          cMapPacked: true,
          standardFontDataUrl: vendorUrl("standard_fonts/"),
          wasmUrl: vendorUrl("wasm/"),
          iccUrl: vendorUrl("iccs/"),
        },
      }));
      return parser;
    })().catch(error => {
      backendPromise = null;
      throw error;
    });
  }
  return backendPromise;
}

async function parseFiles(files, password) {
  const selected = Array.from(files || []);
  if (!selected.length) throw new Error("Please choose at least one CAS PDF file.");
  if (selected.some(file => !/\.pdf$/i.test(file.name))) throw new Error("Please upload CAS PDF files only.");
  let parser;
  try {
    parser = await getPdfBackend();
  } catch (error) {
    throw new Error("The PDF reader could not load. Reload this page and try again.");
  }
  const statements = [];
  for (const file of selected) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const data = await parser.readCasPdf(bytes, password);
      statements.push({ data, label: file.name.replace(/\.pdf$/i, "") });
    } catch (error) {
      // Do not expose raw library errors, which may contain document contents.
      throw new Error("Could not read " + file.name + ". Check the PDF password and use a detailed CAMS or KFintech CAS statement.");
    }
  }
  const portfolio = processedPortfolio(buildPortfolio(mergeStatements(statements)));
  if (!portfolio.schemes.length) throw new Error("No holdings found. Upload detailed CAS PDFs from CAMS or KFintech.");
  return portfolio;
}

function save(portfolio) {
  const processed = processedPortfolio(portfolio);
  try {
    global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, portfolio: processed }));
  } catch (error) {
    throw new Error("The portfolio could not be saved for this browser session. Allow session storage and try again.");
  }
  return processed;
}

function load() {
  try {
    const stored = global.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const data = JSON.parse(stored);
    if (data.version !== 1) return null;
    return processedPortfolio(data.portfolio);
  } catch (error) {
    return null;
  }
}

function clear() {
  try { global.sessionStorage.removeItem(STORAGE_KEY); } catch (error) { /* No stored data to clear. */ }
}

function subset(portfolio, schemes) {
  return portfolioFromSchemes(portfolio, schemes);
}

// Page renderers extend this shared API after the data adapter loads.
global.WealthData = { config, parseFiles, save, load, clear, subset, normalizeFolio, shortFundName };
})(window);
