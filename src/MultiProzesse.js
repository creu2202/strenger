import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaCalendarAlt, FaCheck } from "react-icons/fa";


// --- Feld-Mapping (inkl. Process & Start/End Date aus deinen Sheets)
const NAME_KEYS = ["Process","ProcessName","Process Name","Vorgang","Task","Bezeichnung","Titel","Name"];
const START_KEYS = ["Start Date","Start","StartDate","Starttermin","Anfang"];
const END_KEYS   = ["End Date","End","EndDate","Endtermin","Finish"];
const DURATION_KEYS = ["Duration", "Dauer", "Dauer [d]", "Duration (d)"];
const TRADE_KEYS = ["Trade","Gewerk"];
// Prozess-ID Keys (für Zuordnung zu Personen aus Karten)
const PROCESS_ID_KEYS = [
  "Process Id", "ProcessID", "ProcessId", "Prozess Id", "ProzessID", "Process GUID", "Process Guid", "ProcessGUID", "ID"
];

const COLOR_KEYS = ["Trade Background Color", "Trade BG Color", "Trade Color", "Gewerk Farbe"];

const STATUS_KEYS = ["Status", "Progress", "Fortschritt"];

const toPercent = (v) => {
  if (v == null || v === "") return null;
  const num = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  if (!isFinite(num)) return null;
  return num <= 1 ? Math.round(num * 100) : Math.round(num);
};

// neben TRADE_KEYS usw.:
const RESPONSIBLES_KEYS = [
  "Responsibles", "Responsible", "Verantwortlich", "Verantwortliche", "Verantwortliche(r)"
];

// robustes Parsen (Array, "A, B", "A;B", "A/B", "A|B", Zeilenumbrüche)
const parseResponsibles = (val) => {
  if (!val && val !== 0) return [];
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
  const s = String(val);
  return s
    .split(/[\n,;\/|]+/g)
    .map(t => t.trim())
    .filter(Boolean);
};

// "Max Mustermann" -> "MM", "Müller, Anna" -> "AM", "jean-luc picard" -> "JP"
// "Cher" -> "CH", "max@firma.de" -> "MF"
const initialsFromString = (raw) => {
  if (!raw) return "";
  let s = String(raw).trim();

  // Emails → lokalen Teil nehmen
  if (s.includes("@")) s = s.split("@")[0];

  // "Nachname, Vorname" → umdrehen
  if (s.includes(",")) {
    const [a, b] = s.split(",").map(t => t.trim()).filter(Boolean);
    if (a && b) s = `${b} ${a}`;
  }

  // Trennen an Leerzeichen/Bindestrich/Unterstrich/Punkt
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // 1 Wort → erste zwei Buchstaben
  return s.slice(0, 2).toUpperCase();
};

const normalizeColor = (val) => {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  // Hex oder CSS-Farbfunktion erlauben
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
  if (/^(rgb|hsl)a?\(/i.test(s)) return s;
  return null; // unbekanntes Format -> später Fallback
};

const fmtDM = (d) =>
  d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "–";

const startOfISOWeek = (d) => {
  const x = new Date(d); const day = (x.getDay() + 6) % 7; // Mo=0 ... So=6
  x.setDate(x.getDate() - day); x.setHours(0,0,0,0);
  return x;
};
const endOfISOWeek = (d) => addDays(startOfISOWeek(d), 6);


// ISO-Kalenderwoche (KW) berechnen
const getISOWeek = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;         // 1..7 (Mo..So)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // auf Donnerstag der ISO-Woche
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
};


// --- Farb-Utilities: parse + Kontrast-basierte Textfarbe --------------------
const parseHex = (s) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s || "");
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join(""); // #abc -> #aabbcc
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: 1,
  };
};

const parseRgb = (s) => {
  const m = /^rgba?\(([^)]+)\)$/i.exec(s || "");
  if (!m) return null;
  const parts = m[1].split(",").map((x) => x.trim());
  if (parts.length < 3) return null;
  const toNum = (v) =>
    v.endsWith("%") ? Math.round((parseFloat(v) / 100) * 255) : parseFloat(v);
  const r = toNum(parts[0]);
  const g = toNum(parts[1]);
  const b = toNum(parts[2]);
  const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a: Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1 };
};

// HSL(a) -> RGB
const hslToRgb = (h, s, l) => {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60)      [r1, g1, b1] = [c, x, 0];
  else if (h < 120)[r1, g1, b1] = [x, c, 0];
  else if (h < 180)[r1, g1, b1] = [0, c, x];
  else if (h < 240)[r1, g1, b1] = [0, x, c];
  else if (h < 300)[r1, g1, b1] = [x, 0, c];
  else             [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
};
const parseHsl = (s) => {
  const m = /^hsla?\(([^)]+)\)$/i.exec(s || "");
  if (!m) return null;
  const parts = m[1].split(",").map((x) => x.trim().replace("%", ""));
  if (parts.length < 3) return null;
  const h = parseFloat(parts[0]);
  const sat = parseFloat(parts[1]);
  const lig = parseFloat(parts[2]);
  const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
  if ([h, sat, lig].some((n) => Number.isNaN(n))) return null;
  const { r, g, b } = hslToRgb(h, sat, lig);
  return { r, g, b, a: Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1 };
};

const parseAnyColor = (val) => {
  if (!val) return null;
  const s = String(val).trim();
  return parseHex(s) || parseRgb(s) || parseHsl(s) || null;
};

const blendOverWhite = ({ r, g, b, a }) => {
  if (a === undefined || a >= 1) return { r, g, b };
  // Modul-Hintergrund ist weiß → mit Weiß mischen
  return {
    r: Math.round(r * a + 255 * (1 - a)),
    g: Math.round(g * a + 255 * (1 - a)),
    b: Math.round(b * a + 255 * (1 - a)),
  };
};

const relLuminance = ({ r, g, b }) => {
  const srgbToLin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

// Wählt die Textfarbe (#000 oder #fff) mit dem höheren WCAG-Kontrast
const textColorForBg = (bg) => {
  const parsed = parseAnyColor(bg);
  if (!parsed) return "#000";
  const { r, g, b } = blendOverWhite(parsed);
  const L = relLuminance({ r, g, b });
  const contrastWhite = (1.0 + 0.05) / (L + 0.05);
  const contrastBlack = (L + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? "#fff" : "#000";
};



// generischer Picker
const pick = (obj, keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
  return undefined;
};

// Excel-Serial -> Date
const excelSerialToDate = (serial) => {
  const base = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30
  return new Date(base.getTime() + serial * 86400000);
};

const parseDate = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" && isFinite(v)) {
    const d = excelSerialToDate(v);
    return isNaN(d) ? null : d;
  }
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === "string") {
    const s = v.trim();
    const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/;
    const m = s.match(dmy);
    if (m) {
      const dd = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10) - 1;
      let yy = parseInt(m[3], 10);
      if (yy < 100) yy += 2000;
      const d = new Date(yy, mm, dd);
      return isNaN(d) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  return null;
};

const fmtShort = (d) =>
  d ? d.toLocaleDateString(undefined, { year: "2-digit", month: "2-digit", day: "2-digit" }) : "–";

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

const inWindow = (start, end, from, to) => {
  const sIn = start && start >= from && start <= to;
  const eIn = end && end >= from && end <= to;
  return sIn || eIn;
};

// baut „Level 1 / Level 2 / …“ aus allen vorhandenen TaktZone-Levelspalten
const buildAreaPath = (row) => {
  const pairs = Object.keys(row)
    .filter((k) => k.startsWith("TaktZone Level"))
    .map((k) => [parseInt(k.split(" ")[2], 10), row[k]])
    .filter(([lvl, val]) => !isNaN(lvl) && val != null && String(val).trim() !== "")
    .sort((a, b) => a[0] - b[0]);

  const levels = pairs.map(([, val]) => String(val).trim());
  return levels.length ? levels.join(" / ") : (row["Bereich"] || row["Area"] || "—");
};

// Farbe je Gewerk (fallback auf neutrale)
const colorForTrade = (trade) => {
  const map = {
    Elektro: "#2bb1ff",
    HLS: "#e64c3c",
    Reinigung: "#8b9ab2",
    Türen: "#f6b01a",
    Maler: "#6b4cd4",
    Bodenleger: "#19b26b",
    Estrich: "#1e5bd8",
    "HLS Planer": "#0db2a6",
    Architekt: "#0db2a6",
  };
  return map[trade] || "#00e0d6";
};

export default function MultiProzesse({
  data,
  projects = [],
  selectedProjects = [],
  gewerkFilter = [],
  bereichFilter = [],
  responsiblesFilter = [],          // <— NEU
  peopleByProcess = {},
}) {
  const today = startOfDay(new Date());
  const from = addDays(today, -14); // -2 Wochen
  const to   = addDays(today, +42); // +6 Wochen
  const [isExporting, setIsExporting] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [showResourceCurve, setShowResourceCurve] = useState(false);
  // Hover-Interaktion für Ressourcenkurve
  const resCurveRef = useRef(null);
  const [hoverDayIdx, setHoverDayIdx] = useState(null);
  const [hoverTrade, setHoverTrade] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

    const defaultTitle = `Multi Projekt Ansicht: (–2 / +6 Wochen) – Zeitraum: ${from.toLocaleDateString('de-DE')} – ${to.toLocaleDateString('de-DE')}`;
    const [exportTitle, setExportTitle] = useState(defaultTitle);

    const onLogoFileChange = (e) => {
      const file = e?.target?.files && e.target.files[0];
      if (!file) {
        setLogoDataUrl(null);
        try { if (typeof window !== 'undefined') localStorage.removeItem('mp.lastLogoDataUrl'); } catch {}
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setLogoDataUrl(reader.result);
        try { if (typeof window !== 'undefined') localStorage.setItem('mp.lastLogoDataUrl', reader.result); } catch {}
      };
      reader.readAsDataURL(file);
    };

    // Beim Mount: zuletzt verwendetes Logo aus localStorage laden (falls vorhanden)
    useEffect(() => {
      try {
        if (typeof window !== 'undefined') {
          const last = localStorage.getItem('mp.lastLogoDataUrl');
          if (last) setLogoDataUrl(last);
        }
      } catch {}
    }, []);


  
  const normalizedBereichFilter = useMemo(
  () => (bereichFilter || []).map(b => String(b).toLowerCase().trim()),
  [bereichFilter]
);

const normalizedResponsiblesFilter = useMemo(                 // <— NEU
  () => (responsiblesFilter || []).map(r => String(r).toLowerCase().trim()),
  [responsiblesFilter]
);

  // Arbeitskalender: nur Montag–Donnerstag sichtbar/gezählt
  const isWorkday = (d) => {
    const wd = d.getDay();
    return wd >= 1 && wd <= 4; // 1=Mo ... 4=Do
  };
  const countWorkdaysInclusive = (a, b) => {
    if (!a || !b) return 0;
    const start = startOfDay(a);
    const end = startOfDay(b);
    let c = 0;
    if (start <= end) {
      for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkday(d)) c++;
    } else {
      for (let d = start; d >= end; d = addDays(d, -1)) if (isWorkday(d)) c++;
    }
    return c;
  };
  const diffWorkdays = (a, b) => {
    if (!a || !b) return 0;
    const start = startOfDay(a);
    const end = startOfDay(b);
    let c = 0;
    if (start <= end) {
      for (let d = start; d < end; d = addDays(d, 1)) if (isWorkday(d)) c++;
      return c;
    } else {
      for (let d = start; d > end; d = addDays(d, -1)) if (isWorkday(d)) c++;
      return -c;
    }
  };

  const [dayWidth, setDayWidth] = useState(28); // px pro Tag (responsive)
  // Nur Arbeitstage (Mo-Do) innerhalb des Fensters anzeigen
  const days = useMemo(() => {
    const res = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (isWorkday(d)) res.push(new Date(d));
    }
    return res;
  }, [from, to]);
  const totalDays = Math.max(1, days.length);
  const timelineWidth = totalDays * dayWidth;

  // Canvas soll die volle Breite ausnutzen -> dayWidth dynamisch an verfügbare Breite anpassen
  useEffect(() => {
    const recalc = () => {
      const sc = scrollRef.current;
      const avail = (sc ? sc.clientWidth : 0) - 380; // rechte Spaltenbreite = Gesamtbreite minus linke 380px
      if (avail > 0 && totalDays > 0) {
        const w = Math.max(18, avail / totalDays); // Mindestbreite je Arbeitstag
        if (Math.abs(w - dayWidth) > 0.5) setDayWidth(w);
      }
    };
    recalc();
    let ro;
    try {
      if (window && 'ResizeObserver' in window) {
        ro = new ResizeObserver(() => recalc());
        if (scrollRef.current) ro.observe(scrollRef.current);
      }
      window.addEventListener('resize', recalc);
    } catch {}
    return () => {
      try { window.removeEventListener('resize', recalc); } catch {}
      try { if (ro) ro.disconnect(); } catch {}
    };
  }, [totalDays]);

  // --- Daten vorbereiten (wie zuvor), danach in Gruppen (Projekt+Bereichspfad) bündeln
  const groups = useMemo(() => {
    if (!data) return [];

    const allowProjects =
      selectedProjects && selectedProjects.length > 0
        ? new Set(selectedProjects)
        : new Set(Object.keys(data));

    const allowTrades =
      gewerkFilter && gewerkFilter.length > 0
        ? new Set(gewerkFilter.map((g) => String(g).trim()))
        : null;

    const allowResponsibles =                                  // <— NEU
     normalizedResponsiblesFilter.length > 0
    ? normalizedResponsiblesFilter
    : null;

    // groups: { key, project, area, items:[{name,trade,start,end}] }
    const map = new Map();

    for (const projName of Object.keys(data)) {
      if (!allowProjects.has(projName)) continue;

for (const p of data[projName] || []) {
  // Fortschritt (robust: akzeptiert 0..1, 0..100, auch "85%")
  const statusRaw = pick(p, STATUS_KEYS);
  const toPercent = (v) => {
    if (v == null || v === "") return null;
    const s = String(v).replace("%", "").trim().replace(",", ".");
    const num = Number(s);
    if (!isFinite(num)) return null;
    return num <= 1 ? Math.round(num * 100) : Math.round(num);
  };
  const progress = toPercent(statusRaw);          // 0..100 oder null
  const done = progress !== null && progress >= 100;

  // Basisfelder
  const name  = (pick(p, NAME_KEYS) ?? "").toString().trim() || "(ohne Titel)";
  const trade = (pick(p, TRADE_KEYS) ?? "").toString().trim();
  const colorRaw = pick(p, COLOR_KEYS);
  const colorNorm = normalizeColor(colorRaw);
  const color = colorNorm || colorForTrade(trade);

  const area = buildAreaPath(p);

const s    = parseDate(pick(p, START_KEYS));
const eRaw = parseDate(pick(p, END_KEYS));
let e = eRaw ? eRaw : null;
if (s && e && e < s) e = s;

// Dauer in Tagen ermitteln (bevor wir Enddatum -1 Tag anwenden)
let durationDays = null;
const durRaw = pick(p, DURATION_KEYS);
if (durRaw != null && durRaw !== "") {
  const dnum = Number(String(durRaw).replace(",", "."));
  durationDays = isFinite(dnum) ? Math.max(0, Math.round(dnum)) : null;
}
if (durationDays == null) {
  if (s && eRaw) {
    // inklusiv: beide Tage zählen
    durationDays = Math.max(0, diffDays(s, eRaw) + 1);
  } else {
    durationDays = 0;
  }
}

  const responsibles = parseResponsibles(pick(p, RESPONSIBLES_KEYS));

  // Filter / Fenster
  if (!s && !e) continue;
  if (!inWindow(s, e, from, to)) continue;
  if (allowTrades && (!trade || !allowTrades.has(trade))) continue;

  // NEU: Responsibles-Filter (case-insensitive, erlaubt Teiltreffer)
  if (allowResponsibles) {
    const respLower = responsibles.map(r => r.toLowerCase());
    const hit = respLower.some(r =>
      allowResponsibles.some(sel => r === sel || r.includes(sel))
    );
    if (!hit) continue;
  }

  if (normalizedBereichFilter.length > 0) {
    const areaLower = String(area).toLowerCase();
    const hit = normalizedBereichFilter.some(sel => areaLower === sel || areaLower.includes(sel));
    if (!hit) continue;
  }

  // Gruppe & Push
  const key = `${projName} :: ${area}`;
  if (!map.has(key)) map.set(key, { key, project: projName, area, items: [] });

  const processId = pick(p, PROCESS_ID_KEYS);
  map.get(key).items.push({
    name, trade, start: s, end: e, color, progress, done,
    durationDays,
    responsibles,                                    // <— NEU (für Tooltip etc.)
    processId: processId != null ? String(processId) : undefined,
  });
}

    }

    // sort groups by project then area; sort items by start
    const arr = Array.from(map.values());
    arr.forEach(g => g.items.sort((a, b) => {
      const ad = a.start || a.end || new Date(8640000000000000);
      const bd = b.start || b.end || new Date(8640000000000000);
      return ad - bd || a.name.localeCompare(b.name);
    }));

    arr.sort((a, b) => {
      if (a.project !== b.project) return a.project.localeCompare(b.project);
      return a.area.localeCompare(b.area);
    });

    return arr;
  }, [data, selectedProjects, gewerkFilter, normalizedBereichFilter, normalizedResponsiblesFilter, from, to]);


// Tagesliste über das Fenster

// Monatssegmente (Label + Span in Tagen)
const months = useMemo(() => {
  const out = [];
  days.forEach((d, i) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    const last = out[out.length - 1];
    if (!last || last.key !== key) {
      out.push({ key, label, startIdx: i, endIdx: i, startDate: d, endDate: d });
    } else {
      last.endIdx = i;
      last.endDate = d;
    }
  });
  // span in Tagen (Grid-Spalten)
  return out.map(m => ({ ...m, span: m.endIdx - m.startIdx + 1 }));
}, [days]);

// Für Trenner (Index 0,7,14,... wo ein Monat beginnt)
const monthBoundaries = useMemo(() => months.map(m => m.startIdx), [months]);


// Montage für KW-Labels
const weeks = useMemo(
  () =>
    days
      .map((d, i) => (d.getDay() === 1 ? { no: getISOWeek(d), idx: i } : null))
      .filter(Boolean),
  [days]
);

// Ressourcen pro Tag je Gewerk berechnen (aus peopleByProcess)
const resourceByDayTrade = useMemo(() => {
  const len = days.length;
  const totals = new Array(len).fill(0);
  const byTrade = new Map(); // trade -> Array(len)
  const tradeColors = new Map(); // trade -> color

  // Map von YYYY-MM-DD -> Index im days-Array
  const keyForDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`; // lokaler Tagsschlüssel ohne UTC-Verschiebung
  };
  const indexByKey = new Map();
  for (let i = 0; i < len; i++) indexByKey.set(keyForDate(days[i]), i);

  for (const g of groups) {
    const pplMap = peopleByProcess?.[g.project] || {};
    for (const it of g.items) {
      if (!it.processId || !it.trade) continue;
      const entry = pplMap[it.processId];
      if (entry == null) continue;

      if (!byTrade.has(it.trade)) byTrade.set(it.trade, new Array(len).fill(0));
      if (!tradeColors.has(it.trade)) tradeColors.set(it.trade, it.color || colorForTrade(it.trade));
      const arr = byTrade.get(it.trade);

      if (typeof entry === "number") {
        // Rückwärtskompatibilität: alte Struktur -> auf gesamte Dauer verteilen
        // (falls Start/Ende bekannt und im Fenster)
        const s = it.start || from;
        const e = it.end || to;
        const sKey = keyForDate(s);
        const eKey = keyForDate(e);
        const sIdx = indexByKey.get(sKey);
        const eIdx = indexByKey.get(eKey);
        if (sIdx != null && eIdx != null) {
          for (let i = Math.max(0, sIdx); i <= Math.min(len - 1, eIdx); i++) {
            arr[i] += entry;
            totals[i] += entry;
          }
        }
      } else if (typeof entry === "object") {
        // Neue Struktur: pro Datum summieren
        for (const [dKey, val] of Object.entries(entry)) {
          if (dKey === "__total__") continue;
          const v = Number(val);
          if (!isFinite(v) || v <= 0) continue;
          const idx = indexByKey.get(dKey);
          if (idx != null) {
            arr[idx] += v;
            totals[idx] += v;
          }
        }
      }
    }
  }

  // compute palette and sorted trades
  const trades = Array.from(byTrade.keys());
  // sort by total descending
  trades.sort((a,b) => {
    const sa = byTrade.get(a).reduce((x,y)=>x+y,0);
    const sb = byTrade.get(b).reduce((x,y)=>x+y,0);
    return sb - sa;
  });
  const maxTotal = totals.reduce((m,v)=>v>m?v:m, 0) || 0;
  return { byTrade, totals, trades, maxTotal, tradeColors };
}, [days, groups, peopleByProcess, from, to]);

const MONTH_H = 28;   // Höhe der Monatschips
const KW_H    = 18;   // Höhe der KW-Zeile
const GAP_H   = 6;    // Abstand zwischen den Zeilen
const BASE_HEADER_H = MONTH_H + KW_H + GAP_H;
const [RESOURCE_H, setRESOURCE_H] = useState(() => {
  const v = Number(localStorage.getItem('resourceCurveH'));
  return isFinite(v) && v >= 24 && v <= 200 ? v : 56;
}); // Höhe für Ressourcenkurve (veränderbar)

useEffect(() => {
  try { localStorage.setItem('resourceCurveH', String(RESOURCE_H)); } catch {}
}, [RESOURCE_H]);
const headerH = BASE_HEADER_H + (showResourceCurve ? RESOURCE_H : 0);

// Text-Zeilenhöhe links (px)
const LABEL_TITLE_LH = 20;  // etwa leading-5
const LABEL_SUB_LH   = 16;  // etwa leading-4
const ROW_PAD        = 8;   // bleibt wie gehabt
const LABEL_MIN_H    = ROW_PAD * 2 + LABEL_TITLE_LH + LABEL_SUB_LH; // = 52px

// Wechselnde Wochen-Bänder (für Hintergrund-Schattierung)
const weekBands = useMemo(() => {
  if (!weeks.length) return [];
  const bands = [];
  for (let i = 0; i < weeks.length; i++) {
    const startIdx = weeks[i].idx;
    const endIdx = (i < weeks.length - 1 ? weeks[i + 1].idx : days.length);
    bands.push({
      startIdx,
      span: Math.max(1, endIdx - startIdx),
      even: i % 2 === 0,
    });
  }
  return bands;
}, [weeks, days.length]);

  const todayOffset = Math.min(
    Math.max(0, diffWorkdays(from, today) * dayWidth + dayWidth / 2),
    timelineWidth
  );

  // Position & Breite eines Balkens (mit Clamping)
  const barBox = (s, e) => {
    const sClamped = s ? (s < from ? from : (s > to ? to : s)) : from;
    const eClamped = e ? (e > to ? to : (e < from ? from : e)) : to;
    const left = Math.max(0, diffWorkdays(from, sClamped)) * dayWidth + 3;
    const width = Math.max(6, countWorkdaysInclusive(sClamped, eClamped) * dayWidth - 6);
    return { left, width };
  };

// clamp & pack ────────────────────────────────────────────────────────────────
const clampToWindow = (s, e, from, to) => {
  const sC = s ? (s < from ? from : (s > to ? to : s)) : from;
  const eC = e ? (e > to ? to : (e < from ? from : e)) : to;
  return { sC, eC };
};

// Greedy-Algorithmus: sortiert nach Start, legt in erste Lane, in der es nicht
// kollidiert (inklusive Endtag → darum <= check). StartIdx/EndIdx sind Tag-Indices.
const packIntoLanes = (items, from, to, diffDaysFn) => {
  const withIdx = items
    .map((it) => {
      const { sC, eC } = clampToWindow(it.start, it.end, from, to);
      return {
        ...it,
        _sC: sC,
        _eC: eC,
        _sIdx: diffDaysFn(from, sC),
        _eIdx: diffDaysFn(from, eC),
      };
    })
    .sort((a, b) => a._sIdx - b._sIdx || a._eIdx - b._eIdx);

  const laneEnds = [];
  const packed = [];

  for (const it of withIdx) {
    let lane = 0;
    while (lane < laneEnds.length && it._sIdx <= laneEnds[lane]) lane++;
    if (lane === laneEnds.length) laneEnds.push(it._eIdx);
    else laneEnds[lane] = it._eIdx;
    packed.push({ ...it, _lane: lane });
  }

  return { packed, laneCount: laneEnds.length };
};




// Refs für Export
 const exportRef = useRef(null);
 const scrollRef = useRef(null);
 const gridRef   = useRef(null);

// --- NEU: Hilfen für SVG
const svgNS = "http://www.w3.org/2000/svg";

function sx(el, attrs) {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  return el;
}
function tnode(text) { return document.createTextNode(text); }

// ===== Mehrzeiliger Text im SVG (tspan) =====
function makeMeasureCtx(font = '600 16px -apple-system, Segoe UI, Roboto, Helvetica, Arial') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  return ctx;
}

function wrapLines(text, maxWidth, measureCtx) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (measureCtx.measureText(t).width <= maxWidth) {
      line = t;
    } else {
      if (line) lines.push(line);
      // sehr lange Tokens hart umbrechen
      if (measureCtx.measureText(w).width > maxWidth) {
        let buf = '';
        for (const ch of w) {
          if (measureCtx.measureText(buf + ch).width <= maxWidth) buf += ch;
          else { lines.push(buf); buf = ch; }
        }
        line = buf;
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Zeichnet mehrzeiligen SVG-Text mit <tspan>.
 * @returns {number} tatsächlich genutzte Höhe (in px)
 */
function drawWrappedSvgText({
  parent,         // SVG-Node (z.B. <svg> oder <g>)
  text,           // String
  x, y,           // linke Baseline der ersten Zeile
  maxWidth,       // verfügbare Breite
  lineHeight,     // Zeilenhöhe in px
  maxHeight,      // maximal nutzbare Höhe
  className,      // CSS-Klasse(n) fürs <text>
  fontForMeasure, // Canvas-Font zum Messen (z.B. '600 16px ...')
  fill,                // NEW
  fontSize,            // NEW (number or string)
  fontWeight,          // NEW
  fontFamily,          // NEW
}) {
  const ctx = makeMeasureCtx(fontForMeasure);
  const lines = wrapLines(text, maxWidth, ctx);

  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const used = Math.min(lines.length, maxLines);

  const el = document.createElementNS(svgNS, 'text');
  if (className) el.setAttribute('class', className);

  for (let i = 0; i < used; i++) {
    const tspan = document.createElementNS(svgNS, 'tspan');
    tspan.setAttribute('x', String(x));
    tspan.setAttribute('y', String(y + i * lineHeight));
    tspan.appendChild(document.createTextNode(lines[i]));
    el.appendChild(tspan);
  }

  parent.appendChild(el);
  return used * lineHeight;
}
// --- PDF-Baseline-Help ------------------------------------------------------
const BASELINE_K = 0.32; // optische Mitte ≈ Mitte + 0.32*fontSize
const midY = (top, h, fs) => top + h/2 + fs*BASELINE_K; // Baseline für "zentriert"


async function handleExportPDF() {
  // Maße aus deiner Ansicht übernehmen
  const LEFT_W = 380;                       // linke Spalte (wie im Grid)
  const DW     = dayWidth;                  // px pro Tag
  const totalW = LEFT_W + timelineWidth;    // Gesamtbreite
  const PADDING = 16;

  // --- Komplette Höhe berechnen (wie im Render)
  const ROW_PAD = 8;
  const BAR_H   = 28;
  const V_GAP   = 6;
  const LABEL_TITLE_LH = 20;
  const LABEL_SUB_LH   = 16;
  const LABEL_MIN_H    = ROW_PAD * 2 + LABEL_TITLE_LH + LABEL_SUB_LH; // 52
  const MONTH_H = 28, KW_H = 18, GAP_H = 6;
  const headerH = MONTH_H + KW_H + GAP_H;

  // Heute-Offset
  const today = startOfDay(new Date());
  const todayOffset = Math.min(Math.max(0, diffWorkdays(from, today) * DW + DW / 2), timelineWidth);

  // Row-Heights vorbereiten (identisch wie in deinem Render)
  const rowLayouts = groups.map(g => {
    const { packed, laneCount } = packIntoLanes(g.items, from, to, diffWorkdays);

    // Meilenstein-Lanes (wie oben im Code)
    const MS = 14, PAD = 6, LABEL_H = 22, LABEL_W = Math.max(120, DW * 4), LABEL_W_MIN = 60, LABEL_X_GAP = 4;

    const msItems = packed
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => (it.durationDays || 0) === 0)
      .sort((a, b) => diffWorkdays(from, a.it._sC) - diffWorkdays(from, b.it._sC));

    const msLayout = new Map();
    const msLaneEnds = [];
    msItems.forEach(({ it, i }) => {
      const cx   = diffWorkdays(from, it._sC) * DW + DW / 2;
      const left = cx + MS/2 + PAD;
      const width = Math.max(LABEL_W_MIN, Math.min(LABEL_W, timelineWidth - left));
      const endX = left + width;

      let lane = 0;
      while (lane < msLaneEnds.length && left < msLaneEnds[lane] + LABEL_X_GAP) lane++;
      if (lane === msLaneEnds.length) msLaneEnds.push(endX); else msLaneEnds[lane] = endX;

      msLayout.set(i, { lane, left, width, cx });
    });
    const msLaneCount = msLaneEnds.length;
    const msBlockH = msLaneCount ? msLaneCount * LABEL_H + (msLaneCount - 1) * V_GAP : 0;

    const barsHeight = ROW_PAD * 2 + laneCount * BAR_H + Math.max(0, laneCount - 1) * V_GAP;
    const rowHeight  = Math.max(barsHeight + msBlockH, LABEL_MIN_H);

    return { g, packed, laneCount, rowHeight, msLayout, msLaneCount, msBlockH };
  });

  const bodyH = rowLayouts.reduce((sum, r) => sum + r.rowHeight, 0);
  const totalH = headerH + bodyH;

  // --- SVG aufbauen (DOM, nicht als String; zuverlässiger)
  const svg = sx(document.createElementNS(svgNS, "svg"), {
    xmlns: svgNS,
    width: totalW,
    height: totalH,
    viewBox: `0 0 ${totalW} ${totalH}`,
  });

  // Hintergrund
  svg.appendChild(sx(document.createElementNS(svgNS, "rect"), {
    x: 0, y: 0, width: totalW, height: totalH, fill: "#ffffff"
  }));

  // Fonts + Defaults
  const defs = document.createElementNS(svgNS, "defs");
  const style = document.createElementNS(svgNS, "style");
  style.appendChild(tnode(`
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol"; }
    .small { font-size: 11px; fill: #475569; }
    .tiny  { font-size: 10px; fill: #475569; }
    .label-strong { font-weight: 600; fill: #0f172a; }
    .label-sub    { fill: #64748b; }
  `));
  defs.appendChild(style);
  svg.appendChild(defs);

  // --- Header (rechts) ---
  const headerG = sx(document.createElementNS(svgNS, "g"), { transform: `translate(${LEFT_W},0)` });
  svg.appendChild(headerG);

  // Monats-Bänder
  months.forEach((m, i) => {
    headerG.appendChild(sx(document.createElementNS(svgNS, "rect"), {
      x: m.startIdx * DW,
      y: 0,
      width: m.span * DW,
      height: headerH,
      fill: i % 2 === 0 ? "rgba(148,163,184,0.06)" : "rgba(148,163,184,0.03)"
    }));
  });

  // Tagesraster + Montags-Linien
  days.forEach((d, i) => {
    // Raster
    headerG.appendChild(sx(document.createElementNS(svgNS, "line"), {
      x1: i * DW, y1: 0, x2: i * DW, y2: headerH, stroke: "#e5e7eb", "stroke-width": 1
    }));
  });
  weeks.forEach(w => {
    headerG.appendChild(sx(document.createElementNS(svgNS, "line"), {
      x1: w.idx * DW, y1: 0, x2: w.idx * DW, y2: headerH, stroke: "#cbd5e1", "stroke-width": 2
    }));
  });

  // Monats-Trenner
  monthBoundaries.forEach(idx => {
    headerG.appendChild(sx(document.createElementNS(svgNS, "line"), {
      x1: idx * DW, y1: 0, x2: idx * DW, y2: headerH, stroke: "#94a3b8", "stroke-width": 3
    }));
  });

  // Heute-Linie
  headerG.appendChild(sx(document.createElementNS(svgNS, "line"), {
    x1: todayOffset, y1: 0, x2: todayOffset, y2: headerH, stroke: "#ff5a5f", "stroke-width": 2
  }));

// --- Monatslabels (Pill nur so breit wie der Text) ---
const MONTH_LABEL_FONT = '700 12px -apple-system, Segoe UI, Roboto, Helvetica, Arial';
const monthMeasure = makeMeasureCtx(MONTH_LABEL_FONT);

months.forEach((m) => {
  const left   = m.startIdx * DW + 6;        // wie in der Webansicht
  const top    = 4;
  const pillH  = MONTH_H - 8;                // identisch zur Web-Höhe
  const text   = m.label;
  const textW  = monthMeasure.measureText(text).width;

  // Breite der Pill: Text + horizontales Padding (10px links/rechts)
  // und Sicherheit, damit die Pill den Monat nicht „verlässt“:
  const pillW  = Math.min(Math.max(80, textW + 20), m.span * DW - 12);

  const g = sx(document.createElementNS(svgNS, "g"), {
    transform: `translate(${left}, ${top})`
  });

  // Hintergrund der Pill
 const monthR = Math.max(1, Math.min(pillH / 2 - 0.01, pillW / 2 - 0.01));
 g.appendChild(sx(document.createElementNS(svgNS, "rect"), {
   x: 0, y: 0, rx: monthR, ry: monthR, width: pillW, height: pillH,
    fill: "rgba(148,163,184,0.18)",
    stroke: "rgba(148,163,184,0.35)",
    "stroke-width": 1
  }));

  // Text (inline styles → zuverlässige Farben im PDF)
 const t = sx(document.createElementNS(svgNS, "text"), {
   x: 10, y: midY(0, pillH, 12),
    "font-size": "12",
    "font-weight": "700",
    "font-family": '-apple-system, Segoe UI, Roboto, Helvetica, Arial',
    fill: "#0f172a"
  });
  t.appendChild(tnode(text));
  g.appendChild(t);

  headerG.appendChild(g);
});


  // KW-Chips
  weeks.forEach((w) => {
    const ws = days[w.idx];
    const we = endOfISOWeek(ws);
    const left = w.idx * DW + 4;
    const chipW = DW * 7 - 8;

    const g = sx(document.createElementNS(svgNS, "g"), { transform: `translate(${left}, ${MONTH_H + GAP_H})` });
    g.appendChild(sx(document.createElementNS(svgNS, "rect"), {
      x: 0, y: 0, rx: 8, ry: 8, width: chipW, height: KW_H,
      fill: "rgba(255,255,255,0.7)", stroke: "rgba(100,116,139,0.25)", "stroke-width": 1
    }));
 const badgeR = Math.max(1, Math.min((KW_H - 6) / 2 - 0.01, 44 / 2 - 0.01));
 const badge = sx(document.createElementNS(svgNS, "rect"), {
   x: 6, y: 3, rx: badgeR, ry: badgeR, width: 44, height: KW_H - 6,
      fill: "rgba(241,245,249,0.9)", stroke: "rgba(100,116,139,0.35)", "stroke-width": 1
    });
    g.appendChild(badge);

// "KW 37" Badge-Text
const t1 = sx(document.createElementNS(svgNS, "text"), {
  x: 6 + 22,
  y: KW_H / 2,
  "text-anchor": "middle",
  "dominant-baseline": "middle",
  "font-size": "11",
  "font-weight": "700",
  "font-family": '-apple-system, Segoe UI, Roboto, Helvetica, Arial',
  fill: "#0f172a"
});
t1.appendChild(tnode(`KW ${w.no}`));
g.appendChild(t1);

// Datumsbereich
const t2 = sx(document.createElementNS(svgNS, "text"), {
  x: 6 + 22 + 10 + 44,
  y: KW_H / 2,
  "dominant-baseline": "middle",
  "font-size": "11",
  "font-weight": "400",
  "font-family": '-apple-system, Segoe UI, Roboto, Helvetica, Arial',
  fill: "#475569"
});
t2.appendChild(tnode(`${fmtDM(ws)} – ${fmtDM(we)}`));
g.appendChild(t2);


    headerG.appendChild(g);
  });

  // --- Körper/Rows ---
  let yCursor = headerH;

  // linke Spalten-Hintergründe + Trenner
  groups.forEach((_, idx) => {
    const rh = rowLayouts[idx].rowHeight;
    // links (abwechselnd)
    svg.appendChild(sx(document.createElementNS(svgNS, "rect"), {
      x: 0, y: yCursor, width: LEFT_W, height: rh,
      fill: idx % 2 ? "#f8fafc" : "#ffffff"
    }));
    // vertikale Trennlinie links|rechts
    svg.appendChild(sx(document.createElementNS(svgNS, "line"), {
      x1: LEFT_W, y1: yCursor, x2: LEFT_W, y2: yCursor + rh, stroke: "#e5e7eb", "stroke-width": 1
    }));
    // untere Linie gesamt
    svg.appendChild(sx(document.createElementNS(svgNS, "line"), {
      x1: 0, y1: yCursor + rh, x2: totalW, y2: yCursor + rh, stroke: "#e5e7eb", "stroke-width": 1
    }));
    yCursor += rh;
  });

  // linke Labels & rechte Timeline-Inhalte
  yCursor = headerH;

  for (let rowIdx = 0; rowIdx < rowLayouts.length; rowIdx++) {
    const { g, packed, rowHeight, msLayout, msLaneCount, msBlockH, laneCount } = rowLayouts[rowIdx];

// Linke Spalte: Projekt (mehrzeilig) + Bereich (mehrzeilig)
{
  const leftPad   = 16;                          // Innenabstand links
  const rightPad  = 16;                          // etwas Luft zur Trennlinie
  const availW    = Math.max(0, LEFT_W - leftPad - rightPad);
  const maxH      = rowHeight - ROW_PAD * 2;     // nutzbare Höhe in der Zelle

  // Titel (Projekt)
  const titleFontMeasure = '600 16px -apple-system, Segoe UI, Roboto, Helvetica, Arial';
  const titleLH = 20; // px
  const usedH1 = drawWrappedSvgText({
    parent: svg,
    text: g.project,
    x: leftPad,
    y: yCursor + ROW_PAD + titleLH,             // Baseline 1. Zeile
    maxWidth: availW,
    lineHeight: titleLH,
    maxHeight: maxH,
    className: 'label-strong',
    fontForMeasure: titleFontMeasure,
  });

  // Sub (Bereichspfad) – bekommt den restlichen Platz
  const subFontMeasure = '400 13px -apple-system, Segoe UI, Roboto, Helvetica, Arial';
  const subLH = 16; // px
  const remainingH = Math.max(0, maxH - usedH1 - 4);

  if (remainingH > 0) {
    drawWrappedSvgText({
      parent: svg,
      text: g.area,
      x: leftPad,
      y: yCursor + ROW_PAD + usedH1 + 4 + subLH,
      maxWidth: availW,
      lineHeight: subLH,
      maxHeight: remainingH,
      className: 'small label-sub',
      fontForMeasure: subFontMeasure,
    });
  }
}


    // Rechte Timeline-Zelle
    const rightG = sx(document.createElementNS(svgNS, "g"), { transform: `translate(${LEFT_W}, ${yCursor})` });
    svg.appendChild(rightG);

    // Wochenbänder in der Zeile
    weekBands.forEach(b => {
      rightG.appendChild(sx(document.createElementNS(svgNS, "rect"), {
        x: b.startIdx * DW, y: 0, width: b.span * DW, height: rowHeight,
        fill: b.even ? "#f8fafc" : "#ffffff"
      }));
    });

    // Tagesraster
    days.forEach((d, i) => {
      rightG.appendChild(sx(document.createElementNS(svgNS, "line"), {
        x1: i*DW, y1: 0, x2: i*DW, y2: rowHeight, stroke: "#e5e7eb", "stroke-width": 1
      }));
    });

    // Heute-Linie
    rightG.appendChild(sx(document.createElementNS(svgNS, "line"), {
      x1: todayOffset, y1: 0, x2: todayOffset, y2: rowHeight, stroke: "#ff5a5f", "stroke-width": 2
    }));

    // Monats-Trenner (dicker)
    monthBoundaries.forEach(idx => {
      rightG.appendChild(sx(document.createElementNS(svgNS, "line"), {
        x1: idx*DW, y1: 0, x2: idx*DW, y2: rowHeight, stroke: "#94a3b8", "stroke-width": 3
      }));
    });

    // Elemente (Milestones & Balken)
    const BAR_H2 = 28, V_GAP2 = 6;

    packed.forEach((it, i) => {
      const isMilestone = (it.durationDays || 0) === 0;

      if (isMilestone) {
        const lay = msLayout.get(i);
        const MS = 14, LABEL_H = 22;
        const laneTop = ROW_PAD + (lay ? lay.lane : 0) * (LABEL_H + V_GAP2);

        // Diamant
        const cx = lay?.cx ?? (diffWorkdays(from, it._sC) * DW + DW/2);
        const d = `M ${cx} ${laneTop + (LABEL_H/2) - MS/2}
                   l ${MS/2} ${MS/2} l ${-MS/2} ${MS/2}
                   l ${-MS/2} ${-MS/2} Z`;
        const diamond = sx(document.createElementNS(svgNS, "path"), {
          d, fill: it.color, stroke: "rgba(0,0,0,0.10)", "stroke-width": 1
        });
        rightG.appendChild(diamond);

        // Pill-Label (immer rechts)
        const pillLeft = (lay ? lay.left : (cx + MS/2 + 6));
        const pillW    = (lay ? lay.width : Math.max(60, Math.min(Math.max(120, DW*4), timelineWidth - pillLeft)));
        const parsed   = parseAnyColor(it.color);
        const pillBg  = parsed ? `rgba(${parsed.r},${parsed.g},${parsed.b},0.12)` : "rgba(0,0,0,0.06)";
        const pillBor = parsed ? `rgba(${parsed.r},${parsed.g},${parsed.b},0.35)` : "rgba(0,0,0,0.1)";


 const msR = Math.max(1, Math.min(LABEL_H / 2 - 0.01, pillW / 2 - 0.01));
 rightG.appendChild(sx(document.createElementNS(svgNS, "rect"), {
   x: pillLeft, y: laneTop, rx: msR, ry: msR, width: pillW, height: LABEL_H,
          fill: pillBg, stroke: pillBor, "stroke-width": 1
        }));
        const t = sx(document.createElementNS(svgNS, "text"), {
          x: pillLeft + 10, y: laneTop + LABEL_H/2, "dominant-baseline":"middle"
        });
        t.setAttribute("class","small label-strong");
        t.appendChild(tnode(it.name));
        rightG.appendChild(t);
        return;
      }

      // Balken
      const left  = Math.max(0, diffWorkdays(from, it._sC)) * DW + 3;
      const width = Math.max(6, countWorkdaysInclusive(it._sC, it._eC)*DW - 6);
      const top   = ROW_PAD + msBlockH + it._lane * (BAR_H2 + V_GAP2);

      rightG.appendChild(sx(document.createElementNS(svgNS, "rect"), {
        x: left, y: top, rx: 6, ry: 6, width, height: BAR_H2,
        fill: it.color, stroke:"rgba(0,0,0,0.06)", "stroke-width":1
      }));

// Label (Platz für Avatar/Häkchen lassen)
const hasResp = Array.isArray(it.responsibles) && it.responsibles.length > 0;
const AVATAR = 20, BADGE = 18, GAP = 6;
const reserve = (hasResp ? AVATAR + GAP : 0) + (it.done ? BADGE + GAP : 0);

// --- Clip NICHT mehr am <text>, sondern an einem <g> ---
const clipId = `clip-${rowIdx}-${i}`;
const clip = document.createElementNS(svgNS, "clipPath");
clip.setAttribute("id", clipId);
const clipRect = sx(document.createElementNS(svgNS, "rect"), {
  x: left + 8,
  y: top + 4,
  width: Math.max(0, width - reserve - 16),
  height: BAR_H2 - 8
});
clip.appendChild(clipRect);
defs.appendChild(clip);

// Gruppe mit clip-path
const gClip = document.createElementNS(svgNS, "g");
gClip.setAttribute("clip-path", `url(#${clipId})`);
rightG.appendChild(gClip);

// Text mit *inline* Stil (kein className)
const txt = sx(document.createElementNS(svgNS, "text"), {
  x: left + 8,
  y: top + BAR_H2 / 2,
  "dominant-baseline": "middle"
});

// **WICHTIG: alles inline setzen**
txt.setAttribute("fill", textColorForBg(it.color));          // Farbe aus Kontrastfunktion
txt.setAttribute("font-size", "12");
txt.setAttribute("font-weight", "600");
txt.setAttribute("font-family",
  '-apple-system, Segoe UI, Roboto, Helvetica, Arial'
);

txt.appendChild(tnode(it.name));
gClip.appendChild(txt);


      // Avatar-Kreis mit Initialen
      if (hasResp) {
        const initials = initialsFromString(it.responsibles[0]);
        const cx = left + width - (it.done ? (GAP + BADGE + GAP) : GAP) - AVATAR/2;
        const cy = top + BAR_H2/2;

        rightG.appendChild(sx(document.createElementNS(svgNS, "circle"), {
          cx, cy, r: AVATAR/2, fill: "rgba(255,255,255,0.92)", stroke: "rgba(0,0,0,0.08)", "stroke-width":1
        }));
        const itxt = sx(document.createElementNS(svgNS, "text"), { x: cx, y: cy, "text-anchor":"middle", "dominant-baseline":"middle" });
        itxt.setAttribute("class","tiny label-strong");
        itxt.appendChild(tnode(initials));
        rightG.appendChild(itxt);
      }

      // Check-Badge (bei done)
      if (it.done) {
        const r = BADGE/2;
        const cx = left + width - GAP - r;
        const cy = top + BAR_H2/2;
        rightG.appendChild(sx(document.createElementNS(svgNS, "circle"), {
          cx, cy, r, fill: "rgba(255,255,255,0.85)", stroke:"rgba(0,0,0,0.04)", "stroke-width":1
        }));
        // minimalistisches Häkchen (Vektor)
        const path = sx(document.createElementNS(svgNS, "path"), {
          d: `M ${cx-r/2} ${cy} l ${r/3} ${r/3} l ${r/1.5} ${-r/1.5}`,
          stroke: parseAnyColor(it.color) ? it.color : "#16a34a",
          "stroke-width": 2, fill: "none", "stroke-linecap":"round", "stroke-linejoin":"round"
        });
        rightG.appendChild(path);
      }
    });

    yCursor += rowHeight;
  }

// --- SVG → PDF (Vektor) ---
const { jsPDF } = await import('jspdf');

// svg2pdf robust auflösen
const mod = await import('svg2pdf.js');
const svg2pdfFn =
  (typeof mod === 'function' && mod) ||
  (mod && typeof mod.default === 'function' && mod.default) ||
  (mod && typeof mod.svg2pdf === 'function' && mod.svg2pdf) ||
  (typeof window !== 'undefined' && typeof window.svg2pdf === 'function' && window.svg2pdf);

if (!svg2pdfFn) throw new Error('svg2pdf not found');

// === Portrait, eine lange Seite, volle Breite ===

// Zielbreite: A4 Portrait in Punkten (jsPDF nutzt pt). A4 Breite ≈ 595.28 pt
const PW = 595.28;                // Page Width (A4 portrait)
const M  = 16;                    // Rand
// Nur nach Breite skalieren:
const scale = (PW - 2 * M) / totalW;

// Header vorbereiten (Titel + Erstelldatum + Logo rechts)
const titleText = (exportTitle && exportTitle.trim()) ? exportTitle.trim() : defaultTitle;
const createdText = `Erstelldatum: ${new Date().toLocaleDateString('de-DE')}`;
const rightLogoW = logoDataUrl ? 90 : 0; // pt (kleiner als zuvor)
const rightLogoH = logoDataUrl ? 45 : 0; // pt
const rightPad = logoDataUrl ? 12 : 0;   // Abstand zw. Text und Logo

// Für Zeilenumbruch des Titels verfügbare Breite bestimmen
const textMaxWidth = PW - 2*M - (rightLogoW + rightPad);

// Temporäres jsPDF-Objekt zum Messen
const tmpPdf = new jsPDF({ unit: 'pt', format: [PW, 200] });
tmpPdf.setFont('helvetica', 'bold');
tmpPdf.setFontSize(12);
const titleDims = tmpPdf.getTextDimensions(titleText, { maxWidth: textMaxWidth });
const TITLE_FS = 12, DATE_FS = 10, GAP_Y = 6;
let pdfHeaderH = Math.max(46, titleDims.h + GAP_Y + DATE_FS + 6);

// Benötigte Seitenhöhe dynamisch aus SVG-Gesamthöhe (+ Header)
let PH = 2 * M + pdfHeaderH + totalH * scale;  // Page Height (variabel)
// jsPDF hat in manchen Viewern ein sehr großes Seitenlimit (~14400pt)
const MAX_PT = 14400;
if (PH > MAX_PT) PH = MAX_PT;     // optionaler Schutz – sonst wird’s >200″ sehr lang

// PDF jetzt mit **custom Format** (Breite fix, Höhe dynamisch) anlegen:
const pdf = new jsPDF({
  orientation: 'portrait',
  unit: 'pt',
  format: [PW, PH],
});

// Header zeichnen
pdf.setFont('helvetica', 'bold');
pdf.setFontSize(TITLE_FS);
pdf.text(titleText, M, M + TITLE_FS, { maxWidth: textMaxWidth });

pdf.setFont('helvetica', 'normal');
pdf.setFontSize(DATE_FS);
pdf.text(createdText, M, M + TITLE_FS + GAP_Y + DATE_FS);

// Logo rechts oben einfügen (kleiner)
if (logoDataUrl) {
  try {
    let format = 'PNG';
    if (typeof logoDataUrl === 'string') {
      if (logoDataUrl.startsWith('data:image/jpeg')) format = 'JPEG';
      else if (logoDataUrl.startsWith('data:image/webp')) format = 'WEBP';
      else if (logoDataUrl.startsWith('data:image/png')) format = 'PNG';
      else if (logoDataUrl.startsWith('data:image/svg')) format = 'SVG';
    }
    const x = PW - M - rightLogoW;
    const y = M;
    pdf.addImage(logoDataUrl, format, x, y, rightLogoW, rightLogoH);
  } catch (e) {
    // Logo optional, Fehler ignorieren
  }
}

// SVG-Inhalt unterhalb des Headers rendern
await svg2pdfFn(svg, pdf, {
  x: M,
  y: M + pdfHeaderH,
  width:  totalW * scale,
  height: totalH * scale,
  preserveAspectRatio: 'xMinYMin meet',
});

pdf.setProperties({ title: 'MultiProzesse' });


const todayStr = new Date().toISOString().slice(0,10);
pdf.save(`MultiProzesse_${todayStr}.pdf`);


}







  return (
    <div className="w-full">
      {/* Titelzeile */}
      <div className="flex items-center gap-3 mb-4">
        <FaCalendarAlt className="text-[#00e0d6]" />
        <h2 className="text-2xl font-semibold">Prozesse (–2 Wochen / +6 Wochen)</h2>
        <span className="text-xs text-gray-400">
          Zeitraum: {fmtShort(from)} – {fmtShort(to)}
        </span>
        <span className="text-xs text-gray-500">• {groups.reduce((n,g)=>n+g.items.length,0)} Einträge</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowResourceCurve(v => !v)}
            className={`px-3 py-2 rounded-md text-sm font-medium border shadow ${showResourceCurve ? 'bg-[#00e0d6] text-black border-transparent' : 'bg-black/80 hover:bg-black text-white border-black/20'}`}
            title="Ressourcenkurve (Personen/Tag) ein-/ausblenden"
          >
            {showResourceCurve ? 'Ressourcenkurve: AN' : 'Ressourcenkurve: AUS'}
          </button>

          {/* Größe der Ressourcenkurve einstellen */}
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="hidden sm:inline">Höhe:</span>
            <input
              type="range"
              min={24}
              max={200}
              step={2}
              value={RESOURCE_H}
              onChange={(e) => setRESOURCE_H(Number(e.target.value))}
              className="w-28 accent-[#00e0d6]"
              title={`Höhe der Ressourcenkurve: ${RESOURCE_H}px`}
            />
            <input
              type="number"
              min={24}
              max={200}
              step={2}
              value={RESOURCE_H}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (isFinite(n)) setRESOURCE_H(Math.max(24, Math.min(200, n)));
              }}
              className="w-16 px-1 py-1 rounded border border-gray-300 text-gray-800 bg-white"
              title="Höhe der Ressourcenkurve in Pixel"
            />
            <span className="text-gray-500">px</span>
          </div>

          <button
            onClick={() => setShowLogoModal(true)}
            className="px-3 py-2 rounded-md bg-black/80 hover:bg-black text-white text-sm font-medium border border-black/20 shadow"
            title="Plan als PDF exportieren"
          >
            📄 PDF exportieren
          </button>
        </div>
     </div>

 {/* Logo-Upload Modal */}
 {showLogoModal && (
   <div className="fixed inset-0 z-50">
     <div className="absolute inset-0 bg-black/50" onClick={() => setShowLogoModal(false)} />
     <div className="relative mx-auto mt-24 w-[92vw] max-w-md rounded-lg bg-white p-4 shadow-lg">
       <h3 className="text-lg font-semibold mb-1">Logo für PDF</h3>
       <p className="text-sm text-gray-600 mb-3">Lade ein Bild hoch (PNG, JPG oder WebP). Es wird oben rechts in der PDF platziert.</p>

       {/* Titel bearbeiten */}
       <label className="block text-sm font-medium text-gray-700 mb-1">Titel für PDF</label>
       <input
         type="text"
         value={exportTitle}
         onChange={(e) => setExportTitle(e.target.value)}
         className="mb-3 w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-black/20"
         placeholder={defaultTitle}
       />

       {/* Preview von Titel + Erstelldatum */}
       <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-2">
         <div className="text-base font-semibold text-gray-900">{exportTitle || defaultTitle}</div>
         <div className="text-xs text-gray-600">Erstelldatum: {new Date().toLocaleDateString('de-DE')}</div>
       </div>

       {logoDataUrl ? (
         <div className="mb-3">
           <div className="text-xs text-gray-500 mb-1">Logo-Vorschau:</div>
           <img src={logoDataUrl} alt="Logo-Vorschau" className="max-h-24 ml-auto" />
         </div>
       ) : null}
       <input
         type="file"
         accept="image/png,image/jpeg,image/webp,image/svg+xml"
         onChange={onLogoFileChange}
         className="mb-4 w-full text-sm"
       />
       <div className="flex justify-end gap-2">
         <button
           onClick={() => setShowLogoModal(false)}
           className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
         >
           Abbrechen
         </button>
         <button
           onClick={async () => { setShowLogoModal(false); await handleExportPDF(); }}
           className="px-3 py-2 rounded-md bg-black text-white hover:bg-black/90 text-sm"
         >
           Export starten
         </button>
       </div>
     </div>
   </div>
 )}

 {/* Rahmen */}
<div
  id="export-root"
  ref={exportRef}
  className={`rounded-xl border border-[#2a2a2a] overflow-hidden bg-white ${isExporting ? 'exporting' : ''}`}
>
  {/* Gemeinsamer Scroll-Container: vertikal & horizontal */}
  <div
  ref={scrollRef}
  className="relative overflow-auto"
  style={{ maxHeight: "calc(100vh - 140px)" }}  // ggf. 140px an deine Top-Bar anpassen
>

    {/* Grid mit 2 Spalten: links fix 380px (sticky), rechts Timeline mit fixer Pixelbreite */}
 <div
   ref={gridRef}
   data-grid
   className="grid items-start"
      style={{
        gridTemplateColumns: `380px 1fr`,
        alignItems: 'start',
      }}
    >
      {/* Header links (sticky) */}
      <div className="sticky top-0 left-0 z-20 bg-slate-50 px-4 py-3 text-[11px] leading-none uppercase tracking-wide text-slate-600 border-b border-r border-slate-200" data-pdf-text>
        Projekt / Bereich
      </div>

      {/* Header rechts: Kalenderleiste */}
{/* Header rechts: Kalenderleiste (zweizeilig, hell, ohne Overlap) */}
{/* Header rechts: Kalenderleiste (Monate mit Trennern + KW-Chips mit Datum) */}
<div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
  <div className="relative" style={{ height: headerH }}>

    {/* Ressourcen-Kurve (optional) */}
    {showResourceCurve && (
      <div
        className="absolute left-0 right-0"
        style={{ top: 0, height: RESOURCE_H }}
        ref={resCurveRef}
        onMouseMove={(e) => {
          const rect = resCurveRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          let idx = Math.floor(x / dayWidth);
          if (idx < 0) idx = 0;
          if (idx >= days.length) idx = days.length - 1;
          // bestimmen, ob ein bestimmtes Gewerk unter der Maus ist
          const { byTrade, trades, maxTotal } = resourceByDayTrade;
          const pad = 6;
          const H = RESOURCE_H - pad * 2;
          const yFromBottom = RESOURCE_H - y - pad; // 0 am Boden
          let hoveredTrade = null;
          if (maxTotal > 0 && yFromBottom >= 0) {
            let acc = 0;
            for (const tr of trades) {
              const arr = byTrade.get(tr) || [];
              const v = arr[idx] || 0;
              const h = H * (v / maxTotal);
              if (h > 0.5) {
                if (yFromBottom >= acc && yFromBottom <= acc + h) {
                  hoveredTrade = tr;
                  break;
                }
                acc += h;
              }
            }
          }
          setHoverTrade(hoveredTrade);
          setHoverDayIdx(isFinite(idx) ? idx : null);
          setHoverPos({ x, y });
        }}
        onMouseLeave={() => { setHoverDayIdx(null); setHoverTrade(null); }}
      >
        <svg width={timelineWidth} height={RESOURCE_H}>
          {/* Hintergrund */}
          <defs>
            <linearGradient id="res-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#00e0d6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00e0d6" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {/* vertikale Tageslinien dezent */}
          {days.map((d, i) => (
            <line key={`rg-${i}`} x1={i * dayWidth} y1={0} x2={i * dayWidth} y2={RESOURCE_H} stroke="#eef2f7" strokeWidth={1} />
          ))}
          {/* Gestapelte Balken je Gewerk */}
          {(() => {
            const { byTrade, trades, maxTotal } = resourceByDayTrade;
            const pad = 6;
            const H = RESOURCE_H - pad*2;
            const yScale = (v) => maxTotal > 0 ? H * (v / maxTotal) : 0;
            const elements = [];
            for (let i = 0; i < days.length; i++) {
              let yCursor = RESOURCE_H - pad; // von unten nach oben
              for (const tr of trades) {
                const arr = byTrade.get(tr) || [];
                const v = arr[i] || 0;
                const h = yScale(v);
                if (h <= 0.5) continue;
                yCursor -= h;
                const x = i * dayWidth + 1;
                const w = Math.max(1, dayWidth - 2);
                const col = resourceByDayTrade.tradeColors.get(tr) || colorForTrade(tr);
                const isDim = hoverDayIdx === i && hoverTrade && hoverTrade !== tr;
                elements.push(
                  <rect
                    key={`seg-${tr}-${i}`}
                    x={x}
                    y={yCursor}
                    width={w}
                    height={Math.max(0.5, h)}
                    fill={col}
                    fillOpacity={isDim ? 0.2 : 0.5}
                    stroke={col}
                    strokeOpacity={isDim ? 0.4 : 0.8}
                    strokeWidth={0.5}
                  />
                );
              }
            }
            return <g>{elements}</g>;
          })()}
          {/* Total-Linie + Fläche */}
          {(() => {
            const { totals, maxTotal } = resourceByDayTrade;
            const pad = 6;
            const H = RESOURCE_H - pad*2;
            const points = totals.map((v, i) => {
              const x = i * dayWidth + dayWidth / 2;
              const y = RESOURCE_H - pad - (maxTotal > 0 ? H * (v / maxTotal) : 0);
              return [x, y];
            });
            if (!points.length) return null;
            const path = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
            const area = `${'M'}${points[0][0]},${RESOURCE_H - pad} ` +
                         points.map(p => `L${p[0]},${p[1]}`).join(' ') +
                         ` L${points[points.length-1][0]},${RESOURCE_H - pad} Z`;
            return (
              <g>
                <path d={area} fill="url(#res-grad)" stroke="none" />
                <path d={path} fill="none" stroke="#00e0d6" strokeWidth={2} />
                {/* Heute Marker */}
                <line x1={todayOffset} y1={0} x2={todayOffset} y2={RESOURCE_H} stroke="#ff5a5f" strokeWidth={2} />
                {/* Hover Tag-Linie */}
                {hoverDayIdx != null && (
                  <line
                    x1={hoverDayIdx * dayWidth + dayWidth / 2}
                    y1={0}
                    x2={hoverDayIdx * dayWidth + dayWidth / 2}
                    y2={RESOURCE_H}
                    stroke="#111827"
                    strokeDasharray="3,3"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          })()}
        </svg>
        {/* Mini-Legende rechts */}
        <div className="absolute top-1 right-2 flex gap-2 text-[10px] text-slate-600 bg-white/70 rounded px-2 py-1">
          {resourceByDayTrade.trades.slice(0,4).map(tr => (
            <div key={`leg-${tr}`} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: (resourceByDayTrade.tradeColors.get(tr) || colorForTrade(tr)) }} />
              <span className="truncate max-w-[90px]" title={tr}>{tr}</span>
            </div>
          ))}
          {resourceByDayTrade.trades.length > 4 && (
            <span>+{resourceByDayTrade.trades.length - 4} mehr</span>
          )}
        </div>
        {/* Tooltip bei Hover */}
        {hoverDayIdx != null && (
          <div
            className="absolute z-10 bg-white border border-slate-300 rounded-md shadow-lg text-[11px] text-slate-800 p-2 max-w-[280px]"
            style={{
              left: Math.min(Math.max(4, hoverPos.x + 12), timelineWidth - 200),
              top: Math.min(Math.max(2, hoverPos.y + 12), RESOURCE_H - 2),
            }}
          >
            {(() => {
              const d = days[hoverDayIdx];
              const dateStr = d?.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
              const { byTrade, trades, totals } = resourceByDayTrade;
              const items = trades
                .map(tr => ({ tr, v: (byTrade.get(tr) || [])[hoverDayIdx] || 0 }))
                .filter(it => it.v > 0)
                .sort((a,b) => b.v - a.v);
              const total = totals[hoverDayIdx] || 0;
              const focusIdx = hoverTrade ? items.findIndex(x => x.tr === hoverTrade) : -1;
              if (focusIdx > 0) {
                const f = items.splice(focusIdx, 1)[0];
                items.unshift(f);
              }
              return (
                <div>
                  <div className="font-semibold text-[12px] mb-1">{dateStr}</div>
                  <div className="mb-1 text-[11px]"><span className="font-semibold">Total:</span> {total.toLocaleString('de-DE')} Pers.</div>
                  <div className="max-h-40 overflow-auto pr-1">
                    {items.length === 0 ? (
                      <div className="text-slate-500">Keine Ressourcen geplant</div>
                    ) : (
                      items.map(({ tr, v }) => (
                        <div key={`tt-${tr}`} className="flex items-center gap-2 py-0.5">
                          <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: (resourceByDayTrade.tradeColors.get(tr) || colorForTrade(tr)) }} />
                          <span className="flex-1 truncate" title={tr}>
                            {tr}
                          </span>
                          <span className="tabular-nums">{v.toLocaleString('de-DE')}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    )}

    {/* Monats-Hintergrundbänder (sehr dezent) */}
    <div className="absolute left-0 right-0 -z-10" style={{ top: showResourceCurve ? RESOURCE_H : 0, bottom: 0 }}>
      {months.map((m, i) => (
        <div
          key={`mon-bg-${i}`}
          className="absolute"
          style={{
            left: m.startIdx * dayWidth,
            width: m.span * dayWidth,
            top: 0,
            bottom: 0,
            background:
              i % 2 === 0
                ? "linear-gradient(180deg, rgba(148,163,184,0.10), rgba(148,163,184,0.03))"
                : "linear-gradient(180deg, rgba(148,163,184,0.06), rgba(148,163,184,0.02))",
          }}
        />
      ))}
    </div>

    {/* Tagesraster */}
    <div className="absolute left-0 right-0" style={{ top: showResourceCurve ? RESOURCE_H : 0, bottom: 0 }}>
      {days.map((d, i) => (
        <div
          key={`grid-${i}`}
          className="absolute top-0 bottom-0"
          style={{ left: i * dayWidth, width: dayWidth, borderLeft: "1px solid #e5e7eb" }}
        />
      ))}
      {/* Montags-Linien */}
      {weeks.map((w) => (
        <div
          key={`wkline-${w.idx}`}
          className="absolute top-0 bottom-0"
          style={{ left: w.idx * dayWidth, borderLeft: "2px solid #cbd5e1" }}
        />
      ))}
      {/* Monats-Trenner (dicker, über allem Raster) */}
      {monthBoundaries.map((idx) => (
        <div
          key={`mline-${idx}`}
          className="absolute top-0 bottom-0 month-divider"
          style={{ left: idx * dayWidth }}
        />
      ))}
      {/* Heute-Marke */}
      <div className="absolute top-0 bottom-0 border-l-2 border-rose-500" style={{ left: todayOffset }} title="Heute" />
    </div>

    {/* Monatslabels (links im Band) */}
    <div className="absolute left-0 right-0" style={{ top: (showResourceCurve ? RESOURCE_H : 0) + 4, height: MONTH_H - 8, pointerEvents: "none" }}>
      {months.map((m, i) => (
        <div
          key={`m-label-${i}`}
          className="absolute flex items-center"
          style={{
            left: m.startIdx * dayWidth + 6,
            width: Math.max(80, m.span * dayWidth - 12),
            height: MONTH_H - 8,
          }}
        >
          <span className="month-label">{m.label}</span>
        </div>
      ))}
    </div>

    {/* KW-Zeile mit Datum von–bis (Mo–So) */}
    <div className="absolute left-0 right-0" style={{ top: (showResourceCurve ? RESOURCE_H : 0) + MONTH_H + GAP_H, height: KW_H }}>
      {weeks.map((w, i) => {
        const ws = days[w.idx];
        const we = endOfISOWeek(ws);
        return (
          <div
            key={`kw-${w.idx}`}
            className="absolute kw-chip"
            style={{
              left: w.idx * dayWidth + 4,
              top: 0,
              width: dayWidth * 7 - 8, // Woche breit
              height: KW_H,
            }}
          >
            <span className="kw-badge">KW&nbsp;{w.no}</span>
            <span className="kw-range">
              {fmtDM(ws)}&nbsp;–&nbsp;{fmtDM(we)}
            </span>
          </div>
        );
      })}
    </div>
  </div>
</div>


<style>{`
  #export-root.exporting *{
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
    font-variant-ligatures: none;
  }
  #export-root.exporting .sticky,
  [data-grid].exporting .sticky{
    position: relative !important;
    top:auto !important; left:auto !important;
  }
  /* keine künstlichen Verschiebungen von Labels/Chips im Export */
  #export-root.exporting .bar-label,
  #export-root.exporting [data-pdf-text],
  #export-root.exporting .kw-label,
  #export-root.exporting .month-chip{
    transform: none !important;
    line-height: 1 !important;
  }

.month-divider{
  border-left: 3px solid #94a3b8; /* slate-400 */
  box-shadow: 0 0 0 1px rgba(0,0,0,0.02);
  opacity: 0.9;
}

.month-label{
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 9999px;
  color: #0f172a; /* slate-900 */
  background: linear-gradient(180deg, rgba(148,163,184,0.18), rgba(148,163,184,0.06));
  border: 1px solid rgba(148,163,184,0.35);
  box-shadow: 0 1px 0 rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.4);
}

.kw-chip{
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #475569; /* slate-600 */
  padding: 0 6px;
  border-radius: 8px;
  /* „Glas“-Anmutung */
  background: rgba(255,255,255,0.7);
  border: 1px solid rgba(100,116,139,0.25);
  box-shadow: 0 1px 1px rgba(0,0,0,0.04);
}
@supports (backdrop-filter: saturate(1.2) blur(3px)) {
  .kw-chip{ backdrop-filter: saturate(1.2) blur(3px); }
}

.kw-badge{
  font-weight: 800;
  letter-spacing: .03em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 9999px;
  border: 1px solid rgba(100,116,139,0.35);
  background: linear-gradient(180deg, rgba(241,245,249,0.9), rgba(226,232,240,0.6));
  color: #0f172a;
}

.kw-range{
  font-variant-numeric: tabular-nums;
  opacity: .85;
}


`}</style>





      {/* --- ROWS: jede Gruppe = 1 Grid-Zeile mit 2 Zellen (links sticky, rechts Timeline) --- */}
{groups.length === 0 ? (
  <>
    <div className="sticky left-0 z-10 bg-[#111] px-4 py-8 text-center text-gray-400 border-r border-[#2a2a2a]">
      Keine Prozesse im Zeitraum.
    </div>
    <div />
  </>
) : (
  groups.map((g, rowIdx) => {
    // Lanes packen
    const { packed, laneCount } = packIntoLanes(g.items, from, to, diffWorkdays);

const BAR_H = 28;
const V_GAP = 6;

const barsHeight =
  ROW_PAD * 2 +
  laneCount * BAR_H +
  Math.max(0, laneCount - 1) * V_GAP;

// --- Milestone-Lanes: Labels immer rechts, ohne Überlappung ---
const MS = 14;                  // Diamantgröße
const PAD = 6;                  // Abstand Diamant -> Label
const LABEL_H = 22;             // Höhe des Label-Pills
const LABEL_W = Math.max(120, dayWidth * 4); // Zielbreite Label
const LABEL_W_MIN = 60;         // Mindestbreite
const LABEL_X_GAP = 4;          // min. horizontaler Abstand zw. Labels

// Milestones dieser Row (links -> rechts)
const msItems = packed
  .map((it, i) => ({ it, i }))
  .filter(({ it }) => (it.durationDays || 0) === 0)
  .sort((a, b) => diffWorkdays(from, a.it._sC) - diffWorkdays(from, b.it._sC));

// Greedy-Lanes nur für Labels (immer rechts vom Diamanten)
const msLayout = new Map();   // i -> { lane, left, width }
const msLaneEnds = [];        // pro Lane: rechtes Ende des letzten Labels

msItems.forEach(({ it, i }) => {
  const cx = diffWorkdays(from, it._sC) * dayWidth + dayWidth / 2;
  const left = cx + MS / 2 + PAD;  // IMMER rechts
  const width = Math.max(LABEL_W_MIN, Math.min(LABEL_W, timelineWidth - left));
  const endX = left + width;

  let lane = 0;
  while (lane < msLaneEnds.length && left < msLaneEnds[lane] + LABEL_X_GAP) lane++;

  if (lane === msLaneEnds.length) msLaneEnds.push(endX);
  else msLaneEnds[lane] = endX;

  msLayout.set(i, { lane, left, width });
});

const msLaneCount = msLaneEnds.length;

// Platz für die Milestones (oberhalb der Balken)
const msBlockH = msLaneCount
  ? msLaneCount * LABEL_H + (msLaneCount - 1) * V_GAP
  : 0;

// Zusätzliche Höhe basierend auf benötigten Zeilen für Projekt/Bereich links
const leftPadPX = 16, rightPadPX = 16;
const availLeftW = Math.max(0, 380 - leftPadPX - rightPadPX);
try {
  const titleMeasureCtx = makeMeasureCtx('600 16px -apple-system, Segoe UI, Roboto, Helvetica, Arial');
  const subMeasureCtx   = makeMeasureCtx('400 13px -apple-system, Segoe UI, Roboto, Helvetica, Arial');
  const titleLines = wrapLines(g.project || '', availLeftW, titleMeasureCtx);
  const subLines   = wrapLines(g.area || '', availLeftW, subMeasureCtx);
  const labelsH    = ROW_PAD * 2 + (titleLines.length || 1) * LABEL_TITLE_LH + (subLines.length ? 4 + subLines.length * 16 : 0);
  var rowHeight = Math.max(barsHeight + msBlockH, LABEL_MIN_H, labelsH);
} catch (e) {
  var rowHeight = Math.max(barsHeight + msBlockH, LABEL_MIN_H);
}



// --- Milestone-Lanes: Labels immer rechts, keine Überlappung untereinander ---


    return (
      <React.Fragment key={g.key}>
        {/* linke (sticky) Zelle */}
{/* linke (sticky) Zelle – absolut positionierter Text */}
<div
  className={`sticky left-0 z-10 border-r border-slate-200 ${rowIdx % 2 ? "bg-slate-50" : "bg-white"}`}
  style={{
    height: rowHeight,                // identisch zur rechten Zelle
    boxShadow: "2px 0 0 #e5e7eb inset",
  }}
>
{/* linke (sticky) Zelle – absolut positionierter Text */}
<div
  data-lefttext
  data-pdf-text
  style={{
    position: isExporting ? "relative" : "absolute",
    top:       isExporting ? "auto"     : ROW_PAD,
    left:      isExporting ? "auto"     : 16,
    right:     isExporting ? "auto"     : 16,
    padding:   isExporting ? `${ROW_PAD}px 16px 0 16px` : 0,
    lineHeight: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    // Platz: volle Zeilenhöhe nutzen
    maxHeight: rowHeight - ROW_PAD * 2,
    overflow: "hidden",
  }}
>
  {/* Titel (Projekt) – darf umbrechen */}
  <div
    className="font-medium text-slate-900"
    style={{
      fontSize: 16,
      lineHeight: "20px",
      whiteSpace: "normal",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
      margin: 0, padding: 0,
    }}
  >
    {g.project}
  </div>

  {/* Sub (Bereichspfad) – darf umbrechen, etwas kleiner/heller */}
  <div
    className="text-sm text-slate-500"
    style={{
      fontSize: 13,
      lineHeight: "18px",
      whiteSpace: "normal",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
      margin: 0, padding: 0,
    }}
  >
    {g.area}
  </div>
</div>

</div>



        {/* rechte Zelle: Timeline-Row */}
        <div
          className="relative"
          style={{ height: rowHeight, borderBottom: "1px solid #e5e7eb" }}
        >
          {/* Wochenbänder in der Zeile */}
          {weekBands.map((b, i) => (
            <div
              key={`wb-r-${rowIdx}-${i}`}
              className={`absolute top-0 bottom-0 ${b.even ? "bg-slate-50" : "bg-white"}`}
              style={{ left: b.startIdx * dayWidth, width: b.span * dayWidth }}
            />
          ))}

           {/* vertikales Tagesraster */}
            {days.map((d, i) => (
            <div
              key={`row-${rowIdx}-grid-${i}`}
              className="absolute top-0 bottom-0"
              style={{ left: i * dayWidth, width: dayWidth, borderLeft: "1px solid #e5e7eb"}}
            />
          ))}

          {/* Heute-Linie */}
          <div
            className="absolute top-0 bottom-0 border-l-2 border-[#ff5a5f]"
            style={{ left: todayOffset }}
          />

          {/* Monats-Trenner in der Row */}
          {monthBoundaries.map((idx) => (
            <div
              key={`mline-row-${rowIdx}-${idx}`}
              className="absolute top-0 bottom-0 month-divider"
              style={{ left: idx * dayWidth }}
            />
          ))}


          {/* Prozessbalken (ohne Überlappung, dank Lanes) */}
{packed.map((it, i) => {
  const left = Math.max(0, diffWorkdays(from, it._sC)) * dayWidth + 3;
  const width = Math.max(6, countWorkdaysInclusive(it._sC, it._eC) * dayWidth - 6);
  const top = ROW_PAD + msBlockH + it._lane * (BAR_H + V_GAP);

  // 👉 Meilenstein? (Dauer 0 Tage)
  const isMilestone = (it.durationDays || 0) === 0;

if (isMilestone) {
  const layout = msLayout.get(i); // aus dem Prepass
  const cx = diffWorkdays(from, it._sC) * dayWidth + dayWidth / 2;

  // Lane-Top (oberhalb der Balken)
  const msTop = ROW_PAD + (layout ? layout.lane : 0) * (LABEL_H + V_GAP);

  // dezente Label-Farben aus Prozessfarbe
  const parsed = typeof parseAnyColor === "function" ? parseAnyColor(it.color) : null;
  const pillBg = parsed ? `rgba(${parsed.r},${parsed.g},${parsed.b},0.12)` : "rgba(0,0,0,0.06)";
  const pillBorder = parsed ? `rgba(${parsed.r},${parsed.g},${parsed.b},0.35)` : "rgba(0,0,0,0.1)";

  const pillLeft  = layout ? layout.left  : (cx + MS / 2 + PAD);
  const pillWidth = layout ? layout.width : Math.max(LABEL_W_MIN, Math.min(LABEL_W, timelineWidth - (cx + MS / 2 + PAD)));

  return (
    <div key={`ms-${rowIdx}-${i}`}>
      {/* Diamant zentriert auf der Lane */}
      <div
        className="absolute"
        style={{
          left: cx - MS / 2,
          top:  msTop + (LABEL_H - MS) / 2,
          width: MS,
          height: MS,
          backgroundColor: it.color,
          transform: "rotate(45deg)",
          borderRadius: 3,
          boxShadow: "0 0 0 2px #fff inset, 0 0 0 1px rgba(0,0,0,0.1)",
          zIndex: 3,
        }}
        title={`${it.name}
${fmtShort(it.start)} → ${fmtShort(it.end)}
${it.trade || ""}
${(it.responsibles && it.responsibles.length) ? `\nResp: ${it.responsibles.join(", ")}` : ""}${(() => { const p = peopleByProcess && it.processId && peopleByProcess[g.project] && peopleByProcess[g.project][it.processId]; if (p == null) return ""; const total = typeof p === 'number' ? p : Object.entries(p).filter(([k]) => k !== "__total__").reduce((s,[,v]) => s + (Number(v)||0), 0); return `\nPersonen (gesamt aus Karten): ${total}`; })()}`}

      />

      {/* Label IMMER rechts, in eigener Lane */}
      <div
        className="absolute"
        style={{
          left:  pillLeft,
          top:   msTop,
          width: pillWidth,
          height: LABEL_H,
          display: "flex",
          alignItems: "center",
          lineHeight: `${LABEL_H}px`,
          padding: "0 10px",
          borderRadius: 9999,
          background: pillBg,
          border: `1px solid ${pillBorder}`,
          color: "#111",
          fontWeight: 700,
          fontSize: 13,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.03)",
          zIndex: 2,
          pointerEvents: "none",
        }}
        title={`${it.name}\n${fmtShort(it.start)} → ${fmtShort(it.end)}\n${it.trade || ""}${(() => { const p = peopleByProcess && it.processId && peopleByProcess[g.project] && peopleByProcess[g.project][it.processId]; if (p == null) return ""; const total = typeof p === 'number' ? p : Object.entries(p).filter(([k]) => k !== "__total__").reduce((s,[,v]) => s + (Number(v)||0), 0); return `\nPersonen (gesamt aus Karten): ${total}`; })()}` }
      >
        {it.name}
      </div>
    </div>
  );
}





  // 👉 normaler Balken (wie bisher)
// 👉 normaler Balken
// 👉 normaler Balken
return (
  <div
    key={`bar-${rowIdx}-${i}`}
    className="absolute rounded-md shadow"
    style={{
      left,
      width,
      top,
      height: BAR_H,
      backgroundColor: it.color,
      boxShadow: "0 0 0 1px rgba(0,0,0,0.06)",
    }}
    title={`${it.name}
${fmtShort(it.start)} → ${fmtShort(it.end)}
${it.trade || ""}${(it.responsibles && it.responsibles.length) ? `\nResp: ${it.responsibles.join(", ")}` : ""}${(() => { const p = peopleByProcess && it.processId && peopleByProcess[g.project] && peopleByProcess[g.project][it.processId]; if (p == null) return ""; const total = typeof p === 'number' ? p : Object.entries(p).filter(([k]) => k !== "__total__").reduce((s,[,v]) => s + (Number(v)||0), 0); return `\nPersonen (gesamt aus Karten): ${total}`; })()}`}
  >
    {(() => {
      const hasResp = Array.isArray(it.responsibles) && it.responsibles.length > 0;
      const initials = hasResp ? initialsFromString(it.responsibles[0]) : "";
      const AVATAR = 20;   // px
      const BADGE  = 18;   // px (Häkchen)
      const GAP    = 6;    // px
      const reserve =
        (hasResp ? AVATAR + GAP : 0) + (it.done ? BADGE + GAP : 0);

      return (
        <>
          {/* Label – rechts Platz für Avatar/Häkchen freihalten */}
          <div
            className="bar-label"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              height: "100%",
              padding: `0 ${Math.max(8, reserve + 8)}px 0 8px`,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: textColorForBg(it.color),
              pointerEvents: "none",
            }}
          >
            {it.name}
          </div>

          {/* Verantwortlichen-Avatar (rechts im Balken) */}
          {hasResp && (
            <div
              className="absolute"
              style={{
                right: it.done ? (GAP + BADGE + GAP) : GAP, // wenn done: Avatar links vom Häkchen
                top: (BAR_H - AVATAR) / 2,
                width: AVATAR,
                height: AVATAR,
                borderRadius: 9999,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 1px 1px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.5) inset",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: ".02em",
                pointerEvents: "none",
              }}
              title={it.responsibles.join(", ")}
            >
              {initials}
            </div>
          )}

          {/* Check-Badge (nur bei 100 %) */}
          {it.done && (
            <div
              className="absolute"
              style={{
                right: GAP,
                top: (BAR_H - BADGE) / 2,
                width: BADGE,
                height: BADGE,
                borderRadius: 9999,
                background: "rgba(255,255,255,0.85)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            >
              <FaCheck
                style={{
                  width: 12,
                  height: 12,
                  color: parseAnyColor(it.color) ? it.color : "#16a34a",
                }}
              />
            </div>
          )}
        </>
      );
    })()}
  </div>
);


})}

        </div>
      </React.Fragment>
    );
  })
)}

    </div>
  </div>
</div>


      {/* kleine Legende */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mt-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#ff5a5f]" />
          Heute
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-white/10" />
          Wochenenden leicht schattiert
        </div>
      </div>
    </div>
  );
}
