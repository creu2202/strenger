import React, { useMemo, useRef, useState } from "react";
import { FaCalendarAlt, FaCheck } from "react-icons/fa";


// --- Feld-Mapping (inkl. Process & Start/End Date aus deinen Sheets)
const NAME_KEYS = ["Process","ProcessName","Process Name","Vorgang","Task","Bezeichnung","Titel","Name"];
const START_KEYS = ["Start Date","Start","StartDate","Starttermin","Anfang"];
const END_KEYS   = ["End Date","End","EndDate","Endtermin","Finish"];
const TRADE_KEYS = ["Trade","Gewerk"];

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
}) {
  const today = startOfDay(new Date());
  const from = addDays(today, -14); // -2 Wochen
  const to   = addDays(today, +42); // +6 Wochen
  const [isExporting, setIsExporting] = useState(false);


  
const normalizedBereichFilter = useMemo(
  () => (bereichFilter || []).map(b => String(b).toLowerCase().trim()),
  [bereichFilter]
);

const normalizedResponsiblesFilter = useMemo(                 // <— NEU
  () => (responsiblesFilter || []).map(r => String(r).toLowerCase().trim()),
  [responsiblesFilter]
);

  const dayWidth = 28; // px pro Tag (anpassbar)
  const totalDays = Math.max(1, diffDays(from, to) + 1);
  const timelineWidth = totalDays * dayWidth;

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
let e = eRaw ? addDays(eRaw, -1) : null;
if (s && e && e < s) e = s;

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

  map.get(key).items.push({
    name, trade, start: s, end: e, color, progress, done,
    responsibles                                     // <— NEU (für Tooltip etc.)
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
const days = useMemo(
  () => Array.from({ length: totalDays }, (_, i) => addDays(from, i)),
  [from, totalDays]
);

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

const MONTH_H = 28;   // Höhe der Monatschips
const KW_H    = 18;   // Höhe der KW-Zeile
const GAP_H   = 6;    // Abstand zwischen den Zeilen
const headerH = MONTH_H + KW_H + GAP_H;

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
    Math.max(0, diffDays(from, today) * dayWidth + dayWidth / 2),
    timelineWidth
  );

  // Position & Breite eines Balkens (mit Clamping)
  const barBox = (s, e) => {
    const sClamped = s ? (s < from ? from : (s > to ? to : s)) : from;
    const eClamped = e ? (e > to ? to : (e < from ? from : e)) : to;
    const left = Math.max(0, diffDays(from, sClamped)) * dayWidth + 3;
    const width = Math.max(6, (diffDays(sClamped, eClamped) + 1) * dayWidth - 6);
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

const handleExportPDF = async () => {
 const container = exportRef.current;   // #export-root (NEUES Capture-Ziel)
 const scroller  = scrollRef.current;
 const grid      = gridRef.current;
  if (!container || !scroller || !grid) return;

  try { if (document?.fonts?.ready) await document.fonts.ready; } catch {}
  setIsExporting(true);

  const { jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas')).default;

  // komplette Inhaltsgröße des Grids
 const fullW = Math.max(grid.scrollWidth, grid.offsetWidth, grid.clientWidth);
 const fullH = Math.max(grid.scrollHeight, grid.offsetHeight, grid.clientHeight);

// Container fürs Snapshot auf volle Größe „aufziehen“
  const prevContainer = {
    width:  container.style.width,
    height: container.style.height,
    overflow: container.style.overflow,
  };
 container.style.width   = `${fullW}px`;
 container.style.height  = `${fullH}px`;
 container.style.overflow = 'visible';

  // aktuelle Styles sichern & fürs Rendering „aufziehen“
  const prevScroll = { left: scroller.scrollLeft, top: scroller.scrollTop };
  const prevScroller = {
    height:    scroller.style.height,
    maxHeight: scroller.style.maxHeight,
    overflow:  scroller.style.overflow,
    width:     scroller.style.width,
  };
  scroller.style.height    = `${fullH}px`;
  scroller.style.maxHeight = 'none';
  scroller.style.overflow  = 'visible';
  scroller.style.width     = `${fullW}px`;
  scroller.scrollLeft = 0;
  scroller.scrollTop  = 0;


  container.classList.add('exporting'); // Sticky aus
  grid.classList.add('exporting');       // ← SCHRITT 1: HIER hinzufügen!
await new Promise(requestAnimationFrame);
  const canvas = await html2canvas(container, {
    // Browser rendert das DOM 1:1 → keine Baseline-Differenzen
    foreignObjectRendering: true,
    // Auflösung: nimm die des Geräts, keine "künstliche" 2x-Skalierung
    scale: Math.max(2, (window.devicePixelRatio || 1) * 2),
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width: fullW,
    height: fullH,
    windowWidth: fullW,
    windowHeight: fullH,
    scrollX: 0,
    scrollY: 0,
    onclone: (doc) => {
     // im Klon auch Sticky neutralisieren
     doc.querySelector('#export-root')?.classList.add('exporting');
    }
  });
  // Styles zurück
 container.style.width   = prevContainer.width   || '';
 container.style.height  = prevContainer.height  || '';
 container.style.overflow= prevContainer.overflow|| '';
  scroller.style.height    = prevScroller.height    || '';
  scroller.style.maxHeight = prevScroller.maxHeight || '';
  scroller.style.overflow  = prevScroller.overflow  || '';
  scroller.style.width     = prevScroller.width     || '';
 scroller.scrollLeft = prevScroll.left;
 scroller.scrollTop  = prevScroll.top;
  container.classList.remove('exporting');
  grid.classList.remove('exporting');  
  // Sicherheitscheck: wenn der Canvas leer ist → Abbruch
  if (!canvas || canvas.width < 10 || canvas.height < 10) {
    console.error('Canvas leer/zu klein:', canvas?.width, canvas?.height);
    setIsExporting(false);
    return;
  }

  // --- Canvas → PDF (VERTIKAL kacheln; das ist am stabilsten) ---
  const pdf        = new jsPDF('l', 'pt', 'a4');
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin   = 16;
  const drawW    = pageWidth - margin * 2;                 // wir füllen die Breite
  const drawH    = (canvas.height * drawW) / canvas.width; // resultierende Höhe

  const imgData  = canvas.toDataURL('image/png');

  // So viele Seiten, wie nötig (vertikal)
  let y = 0;
  while (y < drawH) {
    pdf.addImage(imgData, 'PNG',  margin, margin - y, drawW, drawH);
    y += (pageHeight - margin * 2);
    if (y < drawH) pdf.addPage();
  }

  const todayStr = new Date().toISOString().slice(0,10);
  pdf.save(`MultiProzesse_${todayStr}.pdf`);
  setIsExporting(false);
};






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
             <div className="ml-auto">
         <button
           onClick={handleExportPDF}
           className="px-3 py-2 rounded-md bg-black/80 hover:bg-black text-white text-sm font-medium border border-black/20 shadow"
           title="Plan als PDF exportieren"
         >
           📄 PDF exportieren
         </button>
       </div>
     </div>

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

    {/* Grid mit 2 Spalten: links fix 340px (sticky), rechts Timeline mit fixer Pixelbreite */}
 <div
   ref={gridRef}
   data-grid
   className="grid items-start"
      style={{
        gridTemplateColumns: `340px ${timelineWidth}px`,
        // optional: minWidth damit die Scrollbar erscheint
        minWidth: 340 + timelineWidth,
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

    {/* Monats-Hintergrundbänder (sehr dezent) */}
    <div className="absolute inset-0 -z-10">
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
    <div className="absolute inset-0">
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
    <div className="absolute left-0 right-0" style={{ top: 4, height: MONTH_H - 8, pointerEvents: "none" }}>
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
    <div className="absolute left-0 right-0" style={{ top: MONTH_H + GAP_H, height: KW_H }}>
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
    const { packed, laneCount } = packIntoLanes(g.items, from, to, diffDays);

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
  .filter(({ it }) => diffDays(it._sC, it._eC) === 0)
  .sort((a, b) => diffDays(from, a.it._sC) - diffDays(from, b.it._sC));

// Greedy-Lanes nur für Labels (immer rechts vom Diamanten)
const msLayout = new Map();   // i -> { lane, left, width }
const msLaneEnds = [];        // pro Lane: rechtes Ende des letzten Labels

msItems.forEach(({ it, i }) => {
  const cx = diffDays(from, it._sC) * dayWidth + dayWidth / 2;
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

const rowHeight = Math.max(barsHeight + msBlockH, LABEL_MIN_H);



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
    gap: 2,
  }}
>
<div
  className="font-medium text-slate-900"
  style={{
    height: LABEL_TITLE_LH,
    lineHeight: `${LABEL_TITLE_LH}px`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0, padding: 0, transform: "translateY(0)"
  }}
>
  {g.project}
</div>

<div
  className="text-sm text-slate-500"
  style={{
    height: LABEL_SUB_LH,
    lineHeight: `${LABEL_SUB_LH}px`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0, padding: 0, transform: "translateY(0)"
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
  const left = Math.max(0, diffDays(from, it._sC)) * dayWidth + 3;
  const width = Math.max(6, (diffDays(it._sC, it._eC) + 1) * dayWidth - 6);
  const top = ROW_PAD + msBlockH + it._lane * (BAR_H + V_GAP);

  // 👉 Meilenstein? (Dauer 0 Tage)
  const isMilestone = diffDays(it._sC, it._eC) === 0;

if (isMilestone) {
  const layout = msLayout.get(i); // aus dem Prepass
  const cx = diffDays(from, it._sC) * dayWidth + dayWidth / 2;

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
${(it.responsibles && it.responsibles.length) ? `\nResp: ${it.responsibles.join(", ")}` : ""}`}

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
        title={`${it.name}\n${fmtShort(it.start)} → ${fmtShort(it.end)}\n${it.trade || ""}`}
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
${it.trade || ""}${(it.responsibles && it.responsibles.length) ? `\nResp: ${it.responsibles.join(", ")}` : ""}`}
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
