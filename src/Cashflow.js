import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaCalendarAlt, FaCheck } from "react-icons/fa";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { cn } from "./components/ui/utils";


// --- Feld-Mapping (inkl. Process & Start/End Date aus deinen Sheets)
const NAME_KEYS = ["Process","ProcessName","Process Name","Vorgang","Task","Bezeichnung","Titel","Name"];
const START_KEYS = ["Start Date","Start","StartDate","Starttermin","Anfang"];
const END_KEYS   = ["End Date","End","EndDate","Endtermin","Finish"];
const DURATION_KEYS = ["[Duration]", "Duration", "Dauer", "Dauer [d]", "Duration (d)"];
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

const darkenColor = (color, percent) => {
  const parsed = parseAnyColor(color);
  if (!parsed) return "#333333";
  const f = 1 - percent / 100;
  return `rgb(${Math.round(parsed.r * f)}, ${Math.round(parsed.g * f)}, ${Math.round(parsed.b * f)})`;
};

const getLightColor = (type, baseColor) => {
  const parsed = parseAnyColor(baseColor);
  if (!parsed) return "rgba(0, 0, 0, 0.05)";
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.15)`;
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
const addMonths = (d, n) => {
  const x = new Date(d);
  const m = x.getMonth() + n;
  x.setMonth(m);
  return x;
};
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

export default function Cashflow({
  data,
  projects = [],
  selectedProjects = [],
  gewerkFilter = [],
  bereichFilter = [],
  responsiblesFilter = [],          // <— NEU
  searchTerm = "",
}) {
  const today = startOfDay(new Date());

  // Globaler Projektzeitraum über alle Daten berechnen (min Start, max Ende)
  const projectRange = useMemo(() => {
    if (!data) return { min: today, max: addMonths(today, 6) };
    let min = null;
    let max = null;
    for (const projName of Object.keys(data)) {
      for (const p of data[projName] || []) {
        const s = parseDate(pick(p, START_KEYS));
        const eRaw = parseDate(pick(p, END_KEYS));
        let e = eRaw ? addDays(eRaw, -1) : null;
        if (s && e && e < s) e = s;
        const a = s || e;
        const b = e || s;
        if (a) {
          if (!min || a < min) min = a;
        }
        if (b) {
          if (!max || b > max) max = b;
        }
      }
    }
    // Fallbacks, falls keine Daten
    if (!min) min = today;
    if (!max) max = addMonths(min, 6);
    return { min: startOfDay(min), max: startOfDay(max) };
  }, [data]);

  // Fensterzustand: von/bis
  const initialFrom = today;
  const initialTo = addMonths(today, 6);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  // Beim Eintreffen der Daten: Start-/Ende-Fenster in Projektgrenzen einklemmen
  useEffect(() => {
    const winMonths = 6; // Standardfensterweite in Monaten
    let f = from;
    let t = to;
    // Falls initial außerhalb der Projektrange, einklemmen
    if (f < projectRange.min) {
      f = projectRange.min;
      t = addMonths(f, winMonths);
    }
    if (t > projectRange.max) {
      t = projectRange.max;
      // versuche, Fensterbreite zu halten
      f = addMonths(t, -winMonths);
      if (f < projectRange.min) f = projectRange.min;
    }
    setFrom(f);
    setTo(t);
  }, [projectRange.min, projectRange.max]);

  // Monatsschritt Navigation
  const shiftMonths = (delta) => {
    const winMonths = 6; // gleiche Fensterbreite beibehalten
    let newFrom = addMonths(from, delta);
    let newTo = addMonths(to, delta);
    // Clamp rechts
    if (newTo > projectRange.max) {
      newTo = projectRange.max;
      newFrom = addMonths(newTo, -winMonths);
    }
    // Clamp links
    if (newFrom < projectRange.min) {
      newFrom = projectRange.min;
      newTo = addMonths(newFrom, winMonths);
      if (newTo > projectRange.max) newTo = projectRange.max;
    }
    setFrom(newFrom);
    setTo(newTo);
  };

  // Zurück zur Standardansicht (heutiger Tag als Start, 6 Monate Breite), geklemmt an Projektgrenzen
  const resetToToday = () => {
    const winMonths = 6;
    let f = startOfDay(new Date());
    let t = addMonths(f, winMonths);
    if (f < projectRange.min) {
      f = projectRange.min;
      t = addMonths(f, winMonths);
    }
    if (t > projectRange.max) {
      t = projectRange.max;
      f = addMonths(t, -winMonths);
      if (f < projectRange.min) f = projectRange.min;
    }
    setFrom(f);
    setTo(t);
  };

  const canPrev = from > projectRange.min;
  const canNext = to < projectRange.max;

  const [isExporting, setIsExporting] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState(null);

    const defaultTitle = `Multi Projekt Ansicht: (Vorschau 6 Monate) – Zeitraum: ${from.toLocaleDateString('de-DE')} – ${to.toLocaleDateString('de-DE')}`;
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

  const normalizedSearchTerm = useMemo(() => searchTerm?.toLowerCase().trim(), [searchTerm]);

  const [dayWidth, setDayWidth] = useState(14); // px pro Tag – wird dynamisch berechnet, um Breite auszufüllen
  const totalDays = Math.max(1, diffDays(from, to) + 1);
  const timelineWidth = totalDays * dayWidth;

  // Dynamische Breite: fülle verfügbaren Platz in der Breite
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;
    const calc = () => {
      // 2px Puffer für Grid-/Zell-Borders, damit keine horizontale Scrollbar entsteht
      const avail = Math.max(300, el.clientWidth - 342); // rechte Spalte
      // Nutze den gesamten verfügbaren Platz: keine Abrundung auf ganze Pixel
      const pxPerDay = Math.max(8, avail / totalDays);
      setDayWidth(pxPerDay);
    };
    calc();
    const ro = new ResizeObserver(() => calc());
    ro.observe(el);
    window.addEventListener('resize', calc);
    return () => { try { ro.disconnect(); } catch {} window.removeEventListener('resize', calc); };
  }, [totalDays]);

  // ===== Aufträge/Zahlungen (Cashflow) – minimal-integriert =====
  const [auftraege, setAuftraege] = useState({}); // key -> Auftrag | Auftrag[]
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null); // -1 = neu, 0..n = bestehenden Auftrag bearbeiten

  // Persistiere Aufträge lokal, damit sie über "Aktualisieren" und Reload bestehen bleiben
  const STORAGE_KEY = "MP_auftraege_v1";
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Normalisieren: sicherstellen, dass Zahlungen gültige Datums-/Zahlenwerte haben
          const normalizeMap = (map) => {
            const out = {};
            Object.entries(map || {}).forEach(([k, v]) => {
              const arr = Array.isArray(v) ? v : (v != null ? [v] : []);
              const normArr = arr.map((o) => {
                const pays = Array.isArray(o?.zahlungen) ? o.zahlungen : [];
                const normPays = pays.map((z) => {
                  const d = new Date(z?.datum);
                  const okDate = isFinite(d.getTime()) ? d.toISOString() : null;
                  const amount = typeof z?.betrag === 'number' ? z.betrag : parseEuro(z?.betrag);
                  return { datum: okDate, betrag: isFinite(amount) ? amount : 0 };
                }).filter(z => z.datum);
                return { ...o, zahlungen: normPays };
              });
              out[k] = normArr.length === 1 ? normArr[0] : normArr;
            });
            return out;
          };
          setAuftraege(normalizeMap(parsed));
        }
      }
    } catch (e) {
      // ignore parse/storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const hasEntries = auftraege && typeof auftraege === 'object' && Object.keys(auftraege).length > 0;
      if (hasEntries) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auftraege));
      } else if (window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [auftraege]);

  const [zahlungsart, setZahlungsart] = useState("einmalig"); // "einmalig" | "mehrfach"
  const [anzahlZahlungen, setAnzahlZahlungen] = useState(2);
  const [selectedProcCtx, setSelectedProcCtx] = useState(null); // { groupKey, procName, start, end }
  // Mehrfachauswahl von Prozessen per Strg + Klick
  const [selectedProcKeys, setSelectedProcKeys] = useState(new Set()); // Set<string>
  const [batchMode, setBatchMode] = useState(false);
  const [batchList, setBatchList] = useState([]); // [{ key, groupKey, procName, start, end }]
  const [form, setForm] = useState({
    lieferant: "",
    spe: "",
    bestellnummer: "",
    auftragsnummer: "",
    plankosten: "",
    istkosten: "",
    zahlungen: [],
    procPlannedStart: null,
    procPlannedEnd: null,
  });

  // Helfer: Einzelauftrag oder Array → immer Array
  const asArray = (entry) => {
    if (!entry) return [];
    return Array.isArray(entry) ? entry : [entry];
  };

  const formatEuro = (value) => {
    if (value === null || value === undefined || value === "") return "";
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(Number(value));
  };
  const parseEuro = (text) => Number(String(text || "").replace(/[^\d,.-]/g, "").replace(",", "."));

  const procKey = (group, it) => `${group.key} :: ${it.name} :: ${it._sC ? it._sC.toISOString() : ''}`;
  const procStableKey = (groupKey, procName) => `${groupKey} :: ${procName} ::`;
  const toggleSelectProc = (group, it, evt) => {
    if (!evt?.ctrlKey) return; // nur bei Strg-Klick
    const key = procKey(group, it);
    const item = {
      key,
      groupKey: group.key,
      procName: it.name,
      start: it.start || it._sC || null,
      end: it.end || it._eC || null,
      durationDays: typeof it.durationDays === 'number' ? it.durationDays : null,
    };
    setSelectedProcKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setBatchList(bl => bl.filter(x => x.key !== key));
      } else {
        next.add(key);
        setBatchList(bl => bl.some(x => x.key === key) ? bl : [...bl, item]);
      }
      return next;
    });
    evt.preventDefault();
    evt.stopPropagation();
  };
  // Fallback-Resolver: findet Aufträge auch dann, wenn _sC (geclampter Start) nicht gesetzt ist
    const resolveAuftrag = (group, it, map) => {
        if (!map) return null;
        // 1) Schlüssel mit _sC (falls vorhanden)
        const k1 = `${group.key} :: ${it.name} :: ${it._sC ? it._sC.toISOString() : ''}`;
        if (map[k1]) return map[k1];

        // 1b) Versuch mit geclamptem Start (falls _sC fehlt)
        if (!it._sC && (it.start || it.end)) {
            const { sC } = clampToWindow(it.start, it.end, from, to);
            const k1c = `${group.key} :: ${it.name} :: ${sC ? sC.toISOString() : ''}`;
            if (map[k1c]) return map[k1c];
        }

        // 2) Fallback: ursprünglicher Start/Ende
        const base = it.start || it.end || null;
        if (base) {
            const d = startOfDay(new Date(base));
            const k2 = `${group.key} :: ${it.name} :: ${d.toISOString()}`;
            if (map[k2]) return map[k2];
        }
        // 3) Fallback ohne Datum
        const k3 = `${group.key} :: ${it.name} ::`;
        if (map[k3]) return map[k3];
        return null;
    };

    // Liefert alle Aufträge (Array) für einen Vorgang (inkl. Fallback-Keys)
    const getOrdersFor = (group, it) => {
      const direct = auftraege[procKey(group, it)];
      if (direct) return asArray(direct);
      const fallback = resolveAuftrag(group, it, auftraege);
      return asArray(fallback);
    };


  // Hilfsfunktion: Zahlungen über gesamte Order-Gruppe zählen (über orderGroupId oder Signatur)
  const countGroupPayments = (group, items, orderIdOrSig) => {
    if (!group || !items || !orderIdOrSig) return 0;
    const matchId = String(orderIdOrSig);
    const sigOf = (o) => {
      const v = (x) => String(x == null ? '' : x).trim();
      return [v(o?.lieferant), v(o?.spe), v(o?.bestellnummer), v(o?.auftragsnummer), v(o?.plankosten)].join('||');
    };
    let total = 0;
    for (const m of items) {
      const list = getOrdersFor(group, m) || [];
      for (const o of list) {
        const id = o?.orderGroupId || sigOf(o);
        if (String(id) === matchId) {
          const pays = Array.isArray(o?.zahlungen) ? o.zahlungen : [];
          total += pays.length;
        }
      }
    }
    return total;
  };

  const openAuftragModal = (group, it) => {
    // Einzelmodus: Prozentfelder zurücksetzen
    setProcShares({});
    setBatchMode(false);
    setBatchList([]);
    const key = procKey(group, it);
    // IMPORTANT: Do not use logical OR with arrays; [] is truthy and would block fallback resolution.
    const existing = auftraege[key] ? asArray(auftraege[key]) : asArray(resolveAuftrag(group, it, auftraege));
    const realStart = it.start || it._sC || null;
    const realEnd = it.end || it._eC || null;
    setSelectedProcCtx({ groupKey: group.key, procName: it.name, start: realStart, end: realEnd, durationDays: (typeof it.durationDays === 'number' && isFinite(it.durationDays)) ? it.durationDays : null });
    setEditingKey(key);
    if (existing && existing.length > 0) {
      const first = existing[0];
      setEditingIndex(0);
      setForm({
        lieferant: first.lieferant || "",
        spe: first.spe || "",
        bestellnummer: first.bestellnummer || "",
        auftragsnummer: first.auftragsnummer || "",
        plankosten: first.plankosten || "",
        istkosten: first.istkosten || "",
        zahlungen: first.zahlungen || [],
        procPlannedStart: first.procPlannedStart || (realStart ? new Date(realStart).toISOString() : null),
        procPlannedEnd: first.procPlannedEnd || (realEnd ? new Date(realEnd).toISOString() : null),
      });
      // Zahlungsart anhand der gesamten Gruppe bestimmen (nicht nur dieses einen Vorgangs)
      try {
        const orderId = first.orderGroupId || `${first.lieferant||''}||${first.spe||''}||${first.bestellnummer||''}||${first.auftragsnummer||''}||${first.plankosten||''}`;
        const totalPays = countGroupPayments(group, group.items, orderId);
        setZahlungsart(totalPays > 1 ? "mehrfach" : "einmalig");
      } catch {
        setZahlungsart((first.zahlungen && first.zahlungen.length > 1) ? "mehrfach" : "einmalig");
      }
    } else {
      // Prefill default payment at process end for new Auftrag (so payments are visible even if user doesn't toggle the radio)
      const defaultZahlungen = (realEnd) ? [{ datum: realEnd, betrag: Number("") || 0 }] : [];
      setForm({ lieferant: "", spe: "", bestellnummer: "", auftragsnummer: "", plankosten: "", istkosten: "", zahlungen: defaultZahlungen, procPlannedStart: realStart ? new Date(realStart).toISOString() : null, procPlannedEnd: realEnd ? new Date(realEnd).toISOString() : null });
      setZahlungsart("einmalig");
      setEditingIndex(-1);
    }
    setModalOpen(true);
  };

  // Öffnet das Auftrags-Modal für eine ganze Gruppe zusammengehöriger Vorgänge
  const openGroupAuftragModal = (group, items) => {
    // Batchmodus: Prozentfelder initialisieren
    setProcShares({});
    if (!items || items.length === 0) return;
    setBatchMode(true);
    // Build batchList from provided items
    const list = items.map(it => ({
      key: procKey(group, it),
      groupKey: group.key,
      procName: it.name,
      start: it.start || it._sC || null,
      end: it.end || it._eC || null,
      durationDays: typeof it.durationDays === 'number' ? it.durationDays : null,
    }));
    setBatchList(list);
    // Default Prozentanteile nach Dauer vorbelegen
    try {
      const durations = list.map(p => {
        if (typeof p.durationDays === 'number' && isFinite(p.durationDays)) return Math.max(0, p.durationDays);
        const s = p.start ? new Date(p.start) : null;
        const e = p.end ? new Date(p.end) : null;
        const ms = (s && e) ? (e.getTime() - s.getTime()) : 0;
        return ms > 0 ? (ms / (1000*60*60*24)) : 0;
      });
      const sum = durations.reduce((a,b)=>a+b,0);
      const obj = {};
      if (sum > 0) {
        durations.forEach((d, i) => { obj[list[i].key] = Math.round((d/sum)*1000)/10; }); // eine Nachkommastelle
      } else {
        const eq = list.length ? (100/list.length) : 0;
        list.forEach(p => { obj[p.key] = Math.round(eq*10)/10; });
      }
      setProcShares(obj);
    } catch { /* ignore */ }
    // Prefill from first item's first order if exists
    const existing = getOrdersFor(group, items[0]);
    if (existing && existing.length > 0) {
      const first = existing[0];
      setForm({
        lieferant: first.lieferant || "",
        spe: first.spe || "",
        bestellnummer: first.bestellnummer || "",
        auftragsnummer: first.auftragsnummer || "",
        plankosten: first.plankosten || "",
        istkosten: first.istkosten || "",
        zahlungen: first.zahlungen || [],
        procPlannedStart: first.procPlannedStart || null,
        procPlannedEnd: first.procPlannedEnd || null,
      });
      // Zahlungsart für die gesamte Gruppe bestimmen
      try {
        const orderId = first.orderGroupId || `${first.lieferant||''}||${first.spe||''}||${first.bestellnummer||''}||${first.auftragsnummer||''}||${first.plankosten||''}`;
        const totalPays = countGroupPayments(group, items, orderId);
        setZahlungsart(totalPays > 1 ? "mehrfach" : "einmalig");
      } catch {
        setZahlungsart((first.zahlungen && first.zahlungen.length > 1) ? "mehrfach" : "einmalig");
      }
    } else {
      setForm({ lieferant: "", spe: "", bestellnummer: "", auftragsnummer: "", plankosten: "", istkosten: "", zahlungen: [], procPlannedStart: null, procPlannedEnd: null });
      setZahlungsart("einmalig");
    }
    setModalOpen(true);
  };

  // Prozentanteile pro Vorgang (nur im Batch-Modal genutzt)
  const [procShares, setProcShares] = useState({}); // key -> percent (0..100)

  // ESC-Taste: Auswahl aufheben (Mehrfachauswahl zurücksetzen)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedProcKeys(new Set());
        setBatchList([]);
        setBatchMode(false);
        setProcShares({});
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const saveAuftrag = () => {
    // Batch-Modus: Auftrag auf mehrere Prozesse anwenden
    if (batchMode) {
      if (!batchList || batchList.length === 0) { setModalOpen(false); return; }

      // Wenn keine individuellen Zahlungen angegeben sind, verteile die Gesamtsumme proportional zur Arbeitszeit
      const userProvidedPayments = Array.isArray(form.zahlungen) && form.zahlungen.length > 0;
      const total = parseEuro(form.plankosten) || 0;

      // Dauer je Vorgang in Tagen (inklusive Bruchteile), fehlende Start/Ende -> 0
      const durations = batchList.map(p => {
        // Bevorzugt: API-Dauer (Duration) aus den Tabellendaten, falls verfügbar
        if (typeof p.durationDays === 'number' && isFinite(p.durationDays)) {
          return { key: p.key, stableKey: `${p.groupKey} :: ${p.procName} ::`, p, days: Math.max(0, p.durationDays) };
        }
        // Fallback: aus Start/Ende berechnen
        const s = p.start ? new Date(p.start) : null;
        const e = p.end ? new Date(p.end) : null;
        const ms = (s && e) ? (e.getTime() - s.getTime()) : 0;
        // Mindestens 0, in Tagen; wenn Ende vor Start, setze 0
        const days = ms > 0 ? (ms / (1000 * 60 * 60 * 24)) : 0;
        return { key: p.key, stableKey: `${p.groupKey} :: ${p.procName} ::`, p, days };
      });
      const totalDays = durations.reduce((acc, d) => acc + d.days, 0);

      // Vorberechnung: Anteile pro Vorgang – bevorzugt per Prozent-Eingabe, sonst per Dauer
      // 1) Prozent-Eingaben einsammeln und Summe bilden
      const pctByKey = {};
      let pctSum = 0;
      if (!userProvidedPayments) {
        batchList.forEach(p => {
          const v = Number(procShares[p.key]);
          if (isFinite(v) && v > 0) { pctByKey[p.key] = v; pctSum += v; }
        });
      }

      // 2) Shares bestimmen
      const shares = durations.map((d) => {
        if (userProvidedPayments) return { ...d, amount: null };
        let raw = 0;
        if (pctSum > 0 && isFinite(pctByKey[d.key])) {
          raw = total * (pctByKey[d.key] / pctSum);
        } else if (totalDays > 0) {
          raw = total * (d.days / totalDays);
        } else {
          raw = 0;
        }
        return { ...d, amount: raw };
      });

      // Cent-genaue Rundung mit Rest auf den letzten Vorgang addieren, damit Summe exakt ist
      if (!userProvidedPayments) {
        let rounded = shares.map(s => ({ ...s, amount: Math.round((s.amount || 0) * 100) / 100 }));
        const sumRounded = rounded.reduce((a, s) => a + (s.amount || 0), 0);
        const delta = Math.round((total - sumRounded) * 100) / 100;
        if (rounded.length > 0 && Math.abs(delta) >= 0.01) {
          rounded[rounded.length - 1].amount = Math.round(((rounded[rounded.length - 1].amount || 0) + delta) * 100) / 100;
        }
        // shares überschreiben
        shares.splice(0, shares.length, ...rounded);
      }

      // Monatsaggregation NEU: Zahlungen nur in Monaten, in denen Prozesse enden.
      // Der Betrag je Prozess = Anteil an Gesamtsumme proportional zur Prozess-Dauer (in Tagen).
      // Enden mehrere Prozesse im selben Monat, werden deren Anteile zu einer Monatszahlung aufsummiert,
      // die an den Prozess gehängt wird, der in diesem Monat am spätesten endet. Auf 1000 aufrunden.
      const monthKey = (d) => {
        try {
          const dt = new Date(d);
          const y = dt.getUTCFullYear();
          const m = dt.getUTCMonth() + 1;
          return `${y}-${String(m).padStart(2, '0')}`;
        } catch { return null; }
      };
      const roundUpThousand = (x) => {
        const n = Number(x) || 0;
        if (n <= 0) return 0;
        return Math.ceil(n / 1000) * 1000;
      };

      // Anker je Monat: Prozess mit letztem Ende in diesem Monat
      const monthAnchors = {}; // mk -> { index, endTs }
      batchList.forEach((p, i) => {
        if (!p.end) return;
        const mk = monthKey(p.end);
        if (!mk) return;
        const endTs = new Date(p.end).getTime();
        const cur = monthAnchors[mk];
        if (!cur || endTs > cur.endTs) monthAnchors[mk] = { index: i, endTs };
      });

      // Summe der Anteile je Monat (vor Rundung)
      const sumByMonthRaw = {}; // mk -> raw amount
      shares.forEach((s, i) => {
        const p = batchList[i];
        if (!p || !p.end) return;
        const mk = monthKey(p.end);
        if (!mk) return;
        const amt = Number(s.amount || 0);
        if (amt > 0) sumByMonthRaw[mk] = (sumByMonthRaw[mk] || 0) + amt;
      });

      // Auf 1000 aufrunden pro Monat
      const payableByMonth = {};
      Object.keys(sumByMonthRaw).forEach(mk => {
        payableByMonth[mk] = roundUpThousand(sumByMonthRaw[mk]);
      });

      // Gemeinsame Order-Group-ID für diese Batch-Speicherung
      const orderGroupId = `og_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

      setAuftraege(prev => {
        const next = { ...prev };
        batchList.forEach((p, i) => {
          const key = p.key;
          const stableKey = `${p.groupKey} :: ${p.procName} ::`;

          let zahlungen;
          if (userProvidedPayments) {
            // Benutzer hat Zahlungen definiert → unverändert übernehmen
            zahlungen = form.zahlungen;
          } else {
            // Neu: exakt eine Zahlung pro Monat. Die Zahlung hängt am Prozess, der in diesem Monat zuletzt endet.
            const payments = [];
            Object.keys(monthAnchors).forEach(mk => {
              const anchor = monthAnchors[mk];
              if (anchor && anchor.index === i && p.end) {
                const amount = payableByMonth[mk] || 0;
                if (amount > 0) payments.push({ datum: p.end, betrag: amount });
              }
            });
            zahlungen = payments;
          }

          const sum = zahlungen.reduce((s, z) => s + Number(z.betrag || 0), 0);
          const payload = {
            ...form,
            zahlungen,
            istkosten: sum ? sum.toFixed(2) : "",
            procPlannedStart: form.procPlannedStart || (p.start ? new Date(p.start).toISOString() : null),
            procPlannedEnd: form.procPlannedEnd || (p.end ? new Date(p.end).toISOString() : null),
            orderGroupId,
          };
          const arr = asArray(next[key]);
          next[key] = [...arr, payload];
          const arrStable = asArray(next[stableKey]);
          next[stableKey] = [...arrStable, payload];
        });
        return next;
      });
      setModalOpen(false);
      // Auswahl zurücksetzen
      setSelectedProcKeys(new Set());
      setBatchList([]);
      setBatchMode(false);
      setProcShares({});
      return;
    }

    // Einzel-Modus wie bisher
    if (!editingKey || !selectedProcCtx) { setModalOpen(false); return; }
    let zahlungen = form.zahlungen || [];
    // Falls noch keine Zahlungen vorhanden sind, aber Plan-Kosten existieren → einmalige Zahlung am Ende anlegen
    if (zahlungen.length === 0 && selectedProcCtx.end) {
      const betrag = Number(form.plankosten) || 0;
      zahlungen = [{ datum: selectedProcCtx.end, betrag }];
    }
    const sum = zahlungen.reduce((s, z) => s + Number(z.betrag || 0), 0);
    // persist baseline planned dates if not set yet
    const payload = {
      ...form,
      zahlungen,
      istkosten: sum.toFixed(2),
      procPlannedStart: form.procPlannedStart || (selectedProcCtx.start ? selectedProcCtx.start.toISOString() : null),
      procPlannedEnd: form.procPlannedEnd || (selectedProcCtx.end ? selectedProcCtx.end.toISOString() : null),
    };
    const stableKey = `${selectedProcCtx.groupKey} :: ${selectedProcCtx.procName} ::`;
    setAuftraege(prev => {
      // update primary key array
      const curr = prev[editingKey];
      const arr = asArray(curr);
      let nextArr;
      if (editingIndex != null && editingIndex >= 0 && editingIndex < arr.length) {
        nextArr = arr.map((o, i) => (i === editingIndex ? payload : o));
      } else {
        nextArr = [...arr, payload];
      }
      // also update date-less stable key to keep mapping when process dates shift
      const currStable = prev[stableKey];
      const arrStable = asArray(currStable);
      let nextArrStable;
      if (editingIndex != null && editingIndex >= 0 && editingIndex < arrStable.length) {
        nextArrStable = arrStable.map((o, i) => (i === editingIndex ? payload : o));
      } else {
        nextArrStable = [...arrStable, payload];
      }
      return { ...prev, [editingKey]: nextArr, [stableKey]: nextArrStable };
    });
    setModalOpen(false);
  };

  // Auftrag löschen (aktuellen Index oder angegebenen Index)
  const deleteAuftrag = (idxToDelete = editingIndex) => {
    if (!editingKey || !selectedProcCtx) return;
    if (idxToDelete == null || idxToDelete < 0) return;
    if (!window.confirm("Diesen Auftrag wirklich löschen?")) return;

    const stableKey = `${selectedProcCtx.groupKey} :: ${selectedProcCtx.procName} ::`;

    setAuftraege(prev => {
      const next = { ...prev };

      const curArr = asArray(next[editingKey]);
      const newArr = curArr.filter((_, i) => i !== idxToDelete);
      if (newArr.length > 0) next[editingKey] = newArr; else delete next[editingKey];

      const curStableArr = asArray(next[stableKey]);
      const newStableArr = curStableArr.filter((_, i) => i !== idxToDelete);
      if (newStableArr.length > 0) next[stableKey] = newStableArr; else delete next[stableKey];

      return next;
    });

    // Nach dem Löschen Modal schließen oder auf neuen Index umschalten
    setModalOpen(false);
    setEditingIndex(null);
  };

  // Alle Aufträge löschen (Zurücksetzen)
  const resetAllAuftraege = () => {
    if (!window.confirm("Wirklich alle Aufträge löschen? Dies kann nicht rückgängig gemacht werden.")) return;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    setAuftraege({});
    setModalOpen(false);
    setEditingKey(null);
    setEditingIndex(null);
    setSelectedProcCtx(null);
  };

  // Wenn Zahlungsart auf einmalig gesetzt wird, Voreinstellung am Enddatum
  useEffect(() => {
    if (!modalOpen || !selectedProcCtx) return;
    if (zahlungsart === "einmalig") {
      setForm(f => ({
        ...f,
        zahlungen: selectedProcCtx.end ? [{ datum: selectedProcCtx.end, betrag: Number(f.plankosten) || 0 }] : [],
      }));
    } else if (zahlungsart === "mehrfach" && (form.zahlungen || []).length === 0 && selectedProcCtx.start && selectedProcCtx.end) {
      const duration = selectedProcCtx.end.getTime() - selectedProcCtx.start.getTime();
      const step = duration / Math.max(1, (anzahlZahlungen - 1));
      const betrag = Math.round(((Number(form.plankosten) || 0) / Math.max(1, anzahlZahlungen)) * 100) / 100;
      const neue = Array.from({ length: Math.max(2, anzahlZahlungen) }).map((_, i) => ({
        datum: new Date(selectedProcCtx.start.getTime() + i * step),
        betrag,
      }));
      setForm(f => ({ ...f, zahlungen: neue }));
    }
  }, [zahlungsart]);

  // istkosten automatisch nachführen
  useEffect(() => {
    const sum = (form.zahlungen || []).reduce((s, z) => s + Number(z.betrag || 0), 0);
    setForm(f => ({ ...f, istkosten: sum ? sum.toFixed(2) : "" }));
  }, [form.zahlungen]);

  // Bei "einmalig": Betrag der einzigen Zahlung automatisch an Plan-Kosten koppeln
  useEffect(() => {
    if (!modalOpen || zahlungsart !== "einmalig") return;
    if (!selectedProcCtx) return;
    setForm(f => {
      const betrag = Number(f.plankosten) || 0;
      const zahlungen = (f.zahlungen && f.zahlungen.length > 0)
        ? [{ ...f.zahlungen[0], betrag }]
        : (selectedProcCtx.end ? [{ datum: selectedProcCtx.end, betrag }] : []);
      return { ...f, zahlungen };
    });
  }, [modalOpen, zahlungsart, selectedProcCtx, form.plankosten]);

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

// Dauer in Tagen ermitteln (bevor wir Enddatum -1 Tag anwenden)
let durationDays = null;
const durRaw = pick(p, DURATION_KEYS);
if (durRaw != null && durRaw !== "") {
  // Robust: erste Zahl aus dem Text extrahieren (z. B. "51 d", "51,0 Tage")
  const m = String(durRaw).match(/-?\d+(?:[.,]\d+)?/);
  if (m) {
    const num = parseFloat(m[0].replace(",", "."));
    if (isFinite(num)) durationDays = Math.max(0, Math.round(num));
  }
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

    // --- GLOBALER SEARCH FILTER ---
    if (normalizedSearchTerm) {
      const nameLower = name.toLowerCase();
      const tradeLower = trade.toLowerCase();
      const areaLower = String(area).toLowerCase();
      const respLower = responsibles.map(r => r.toLowerCase());
      const projLower = projName.toLowerCase();

      const hit = 
        nameLower.includes(normalizedSearchTerm) ||
        tradeLower.includes(normalizedSearchTerm) ||
        areaLower.includes(normalizedSearchTerm) ||
        projLower.includes(normalizedSearchTerm) ||
        respLower.some(r => r.includes(normalizedSearchTerm));
      
      if (!hit) continue;
    }

    // Gruppe & Push
  const key = `${projName} :: ${area}`;
  if (!map.has(key)) map.set(key, { key, project: projName, area, items: [] });

  map.get(key).items.push({
    name, trade, start: s, end: e, color, progress, done,
    durationDays,
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
    const label = d.toLocaleDateString("de-DE", { month: "short" });
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

// Quartalssegmente für den Header
const quarters = useMemo(() => {
  const out = [];
  days.forEach((d, i) => {
    const q = Math.floor(d.getMonth() / 3) + 1;
    const key = `${d.getFullYear()}-Q${q}`;
    const last = out[out.length - 1];
    if (!last || last.key !== key) {
      out.push({
        key,
        qLabel: `Q${q}`,
        yearLabel: d.getFullYear().toString(),
        startIdx: i,
        endIdx: i
      });
    } else {
      last.endIdx = i;
    }
  });
  return out.map(q => ({ ...q, span: q.endIdx - q.startIdx + 1 }));
}, [days]);

// Für Trenner (Index 0,7,14,... wo ein Monat beginnt)
const monthBoundaries = useMemo(() => months.map(m => m.startIdx), [months]);
const quarterBoundaries = useMemo(() => quarters.map(q => q.startIdx), [quarters]);

// Monats-Summen: Summe der Zahlungen, die im jeweiligen Monat stattfinden
    const monthPayTotals = useMemo(() => {
        return months.map((m) => {
            let sum = 0;

            // sicherheitshalber auf Tagesbeginn normalisieren
            const mStart = startOfDay(m.startDate);
            const mEnd   = startOfDay(m.endDate);

            groups.forEach((g) => {
                // WICHTIG: gepackte Items nehmen (mit _sC/_eC), damit der Auftragsschlüssel passt
                const { packed } = packIntoLanes(g.items, from, to, diffDays);

                packed.forEach((it) => {
                    const orders = getOrdersFor(g, it);
                    if (!orders.length) return;
                    orders.forEach((a) => {
                      if (!a || !Array.isArray(a.zahlungen)) return;
                      a.zahlungen.forEach((z) => {
                          const d = startOfDay(new Date(z.datum));
                          if (d >= mStart && d <= mEnd) {
                              const val = (typeof z?.betrag === "number") ? z.betrag : parseEuro(z?.betrag);
                              sum += (isFinite(val) ? val : 0);
                          }
                      });
                    });
                });
            });

            return { key: m.key, label: m.label, value: sum, startIdx: m.startIdx, span: m.span };
        });
    }, [months, groups, auftraege, from, to]);

  // Button: Monatssummen der aktuellen Ansicht in die Zwischenablage kopieren (TSV für Excel)
  const copyMonthlySumsToClipboard = async () => {
    try {
      const rows = [];
      rows.push(["Monat", "Summe (€)"]);
      monthPayTotals.forEach(m => {
        const val = (typeof m.value === 'number' && isFinite(m.value)) ? Math.round(m.value * 100) / 100 : 0;
        // Für deutsches Excel: Dezimaltrennzeichen als Komma
        const valStr = val.toFixed(2).replace('.', ',');
        rows.push([m.label, valStr]);
      });
      const tsv = rows.map(r => r.join('\t')).join('\n');

      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.position = 'fixed';
        ta.style.left = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      alert('Monatssummen wurden in die Zwischenablage kopiert.');
    } catch (e) {
      console.error('Clipboard copy failed', e);
      alert('Fehler beim Kopieren der Monatssummen.');
    }
  };


// Montage für KW-Labels
const weeks = useMemo(
  () =>
    days
      .map((d, i) => (d.getDay() === 1 ? { no: getISOWeek(d), idx: i } : null))
      .filter(Boolean),
  [days]
);

const MONTH_H = 34;   // Obere Header-Zeile (Quartal/Jahr)
const KW_H    = 34;   // Untere Header-Zeile (Monate)
const GAP_H   = 0;    // Kein Abstand mehr
const headerH = MONTH_H + KW_H;

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
function clampToWindow(s, e, from, to) {
  const sC = s ? (s < from ? from : (s > to ? to : s)) : from;
  const eC = e ? (e > to ? to : (e < from ? from : e)) : to;
  return { sC, eC };
}

// Greedy-Algorithmus: sortiert nach Start, legt in erste Lane, in der es nicht
// kollidiert (inklusive Endtag → darum <= check). StartIdx/EndIdx sind Tag-Indices.
function packIntoLanes(items, from, to, diffDaysFn) {
  // Clamp to window and sort by start/end
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

  // Requirement: each process should have its own row. Assign a unique lane per item.
  const packed = withIdx.map((it, idx) => ({ ...it, _lane: idx }));
  return { packed, laneCount: packed.length };
}




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
function makeMeasureCtx(font = '600 16px Inter, sans-serif') {
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
  const LEFT_W = 340;                       // linke Spalte (wie im Grid)
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
  const todayOffset = Math.min(Math.max(0, diffDays(from, today) * DW + DW / 2), timelineWidth);

  // Row-Heights vorbereiten (identisch wie in deinem Render)
  const rowLayouts = groups.map(g => {
    const { packed, laneCount } = packIntoLanes(g.items, from, to, diffDays);

    // Meilenstein-Lanes (wie oben im Code)
    const MS = 14, PAD = 6, LABEL_H = 22, LABEL_W = Math.max(120, DW * 4), LABEL_W_MIN = 60, LABEL_X_GAP = 4;

    const msItems = packed
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => (it.durationDays || 0) === 0)
      .sort((a, b) => diffDays(from, a.it._sC) - diffDays(from, b.it._sC));

    const msLayout = new Map();
    const msLaneEnds = [];
    msItems.forEach(({ it, i }) => {
      const cx   = diffDays(from, it._sC) * DW + DW / 2;
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
    text { font-family: Inter, sans-serif; }
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
const MONTH_LABEL_FONT = '700 12px Inter, sans-serif';
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
    "font-family": 'Inter, sans-serif',
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
  "font-family": 'Inter, sans-serif',
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
  "font-family": 'Inter, sans-serif',
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
  const titleFontMeasure = '600 16px Inter, sans-serif';
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
  const subFontMeasure = '400 13px Inter, sans-serif';
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
        const cx = lay?.cx ?? (diffDays(from, it._sC) * DW + DW/2);
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
      const left  = Math.max(0, diffDays(from, it._sC)) * DW + 3;
      const width = Math.max(6, (diffDays(it._sC, it._eC)+1)*DW - 6);
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
txt.setAttribute("font-family", "Inter, sans-serif");

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

pdf.setProperties({ title: 'Cashflow' });


const todayStr = new Date().toISOString().slice(0,10);
pdf.save(`Cashflow_${todayStr}.pdf`);


}







  return (
    <div className="w-full">
      {/* Titelzeile */}
      <div className="flex items-center gap-3 mb-4">
        <FaCalendarAlt className="text-[#00e0d6]" />
        <h2 className="text-2xl font-semibold">Prozesse (Vorschau 6 Monate)</h2>

        {/* Monat-navigation */}
        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={() => shiftMonths(-1)}
            disabled={!canPrev}
            className={`px-2 py-1 rounded border text-sm ${canPrev ? 'bg-black/60 hover:bg-black text-white border-black/30' : 'bg-black/20 text-gray-400 border-black/10 cursor-not-allowed'}`}
            title="Einen Monat zurück"
          >
            ◀
          </button>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            Zeitraum: {fmtShort(from)} – {fmtShort(to)}
          </span>
          <button
            onClick={() => shiftMonths(1)}
            disabled={!canNext}
            className={`px-2 py-1 rounded border text-sm ${canNext ? 'bg-black/60 hover:bg-black text-white border-black/30' : 'bg-black/20 text-gray-400 border-black/10 cursor-not-allowed'}`}
            title="Einen Monat vor"
          >
            ▶
          </button>
          <button
            onClick={resetToToday}
            className="px-2 py-1 rounded border text-sm bg-black/80 hover:bg-black text-white border-black/30"
            title="Zurück zur Standardansicht (Heute)"
          >
            Heute
          </button>
        </div>

        <span className="text-xs text-gray-500">• {groups.reduce((n,g)=>n+g.items.length,0)} Einträge</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              if (selectedProcKeys.size === 0) return;
              // Batch-Auftrag: Modal öffnen (eigener Button)
              setBatchMode(true);
              setEditingIndex(-1);
              setSelectedProcCtx(null);
              setProcShares({});
              // Form zurücksetzen (Zahlungen werden pro Prozess-Ende beim Speichern erzeugt, falls leer)
              setForm({ lieferant: "", spe: "", bestellnummer: "", auftragsnummer: "", plankosten: "", istkosten: "", zahlungen: [] });
              setModalOpen(true);
            }}
            disabled={selectedProcKeys.size === 0}
            className={`px-3 py-2 rounded-md text-sm font-medium border shadow ${selectedProcKeys.size === 0 ? 'bg-black/20 text-gray-400 border-black/10 cursor-not-allowed' : 'bg-black/80 hover:bg-black text-white border-black/20'}`}
            title="Auftrag für selektierte Vorgänge anlegen"
          >
            ➕ Auftrag für Auswahl
          </button>
          <button
            onClick={copyMonthlySumsToClipboard}
            className="px-3 py-2 rounded-md bg-black/60 hover:bg-black text-white text-sm font-medium border border-black/20 shadow"
            title="Monatssummen der aktuellen Ansicht in die Zwischenablage kopieren"
          >
            📋 Monatssummen kopieren
          </button>
          <button
            onClick={resetAllAuftraege}
            className="px-3 py-2 rounded-md bg-black/80 hover:bg-black text-white text-sm font-medium border border-black/20 shadow"
            title="Alle Aufträge löschen (Zurücksetzen)"
          >
            ♻ Alle Aufträge löschen
          </button>
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
      <div 
        className="sticky top-0 left-0 z-20 bg-slate-50 px-4 flex items-center text-[11px] leading-none uppercase tracking-wide text-slate-600 border-b border-r border-slate-200" 
        style={{ height: headerH }}
        data-pdf-text
      >
        Projekt / Bereich
      </div>

      {/* Header rechts: Kalenderleiste */}
      {/* Header rechts: Kalenderleiste (zweizeilig, hell, exakt wie Screenshot) */}
      <div className="sticky top-0 z-20 border-b border-slate-300 shadow-sm" style={{ backgroundColor: "#f1f3f8" }}>
        <div className="relative" style={{ height: headerH }}>

          {/* Raster im Header */}
          <div className="absolute inset-0">
            {/* Quartals-Trenner */}
            {quarterBoundaries.map((idx) => (
              <div
                key={`qline-h-${idx}`}
                className="absolute top-0 bottom-0"
                style={{ left: idx * dayWidth, borderLeft: "1px solid #cbd5e1" }}
              />
            ))}
            {/* Monats-Trenner (nur in der unteren Zeile sichtbar durch Layout) */}
            {monthBoundaries.map((idx) => (
              <div
                key={`mline-h-${idx}`}
                className="absolute"
                style={{ left: idx * dayWidth, top: MONTH_H, bottom: 0, borderLeft: "1px solid #cbd5e1" }}
              />
            ))}
          </div>

          {/* Obere Zeile: Quartale & Jahre */}
          <div className="absolute left-0 right-0 border-b border-slate-300" style={{ top: 0, height: MONTH_H }}>
            {quarters.map((q, i) => (
              <div
                key={`q-label-${i}`}
                className="absolute flex items-center px-3 h-full"
                style={{
                  left: q.startIdx * dayWidth,
                  width: q.span * dayWidth,
                }}
              >
                <span className="font-bold text-[14px] text-slate-900">{q.qLabel}</span>
                <span className="text-[12px] text-slate-600 ml-auto">{q.yearLabel}</span>
              </div>
            ))}
          </div>

          {/* Untere Zeile: Monate */}
          <div className="absolute left-0 right-0" style={{ top: MONTH_H, height: KW_H }}>
            {months.map((m, i) => (
              <div
                key={`m-label-${i}`}
                className="absolute flex items-center px-3 h-full"
                style={{
                  left: m.startIdx * dayWidth,
                  width: m.span * dayWidth,
                }}
              >
                <span className="text-[12px] text-slate-700">{m.label}</span>
              </div>
            ))}
          </div>

          {/* Heute-Marke im Header */}
          <div className="absolute top-0 bottom-0 border-l-2 border-rose-500 z-30" style={{ left: todayOffset }} />
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
  border-left: 1px solid #cbd5e1;
}

.month-label, .kw-chip, .kw-badge, .kw-range {
  display: none !important;
}


`}</style>





      {/* Summenzeile pro Monat */}
      <div 
        className="sticky z-30 bg-white px-4 py-2 border-t border-slate-200 text-xs font-medium text-slate-600 shadow-sm"
        style={{ top: headerH, left: 0 }}
      >
        Summe / Monat
      </div>
      <div className="sticky z-20 border-t border-slate-200 bg-white shadow-sm" style={{ top: headerH, height: 32 }}>
        {months.map((m, i) => (
          <div
            key={`sum-${i}`}
            className="absolute flex items-center justify-center text-[12px] font-semibold text-slate-700"
            style={{
              left: m.startIdx * dayWidth,
              width: m.span * dayWidth,
              top: 0,
              bottom: 0,
            }}
            title={`${m.label}: ${formatEuro(monthPayTotals[i]?.value ?? 0)}` }
          >
            {formatEuro(monthPayTotals[i]?.value ?? 0)}
          </div>
        ))}
      </div>

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
    let { packed, laneCount } = packIntoLanes(g.items, from, to, diffDays);

    // Gruppierung nach gemeinsamen Aufträgen (orderGroupId):
    // - Der oberste der selektierten/zugeordneten Vorgänge bleibt an seiner Position
    // - Vorgänge derselben OrderGroupId, die darunter liegen, werden direkt darunter gruppiert
    // Hinweis: Wir betrachten pro Vorgang die erste gefundene orderGroupId eines Auftrags.
    const originalIndex = new Map(packed.map((it, i) => [it, i]));
    const groupIdMap = new Map(); // it -> groupId
    const groupToItems = new Map(); // groupId -> Set(items)
    const sign = (o) => {
      const v = (x) => String(x == null ? '' : x).trim();
      return [v(o?.lieferant), v(o?.spe), v(o?.bestellnummer), v(o?.auftragsnummer), v(o?.plankosten)].join('||');
    };
    packed.forEach(it => {
      const orders = getOrdersFor(g, it) || [];
      const og = orders.map(o => o && (o.orderGroupId || sign(o))).find(Boolean);
      if (og) {
        groupIdMap.set(it, og);
        if (!groupToItems.has(og)) groupToItems.set(og, new Set());
        groupToItems.get(og).add(it);
      }
    });

    // Reorder: move members below the top-most anchor directly under it
    let arr = [...packed];
    groupToItems.forEach((set, og) => {
      const items = Array.from(set);
      if (items.length <= 1) return;
      // anchor = item with smallest original index
      items.sort((a,b) => originalIndex.get(a) - originalIndex.get(b));
      const anchor = items[0];
      let anchorPos = arr.indexOf(anchor);
      const below = items.slice(1).filter(it => originalIndex.get(it) > originalIndex.get(anchor));
      below.sort((a,b) => originalIndex.get(a) - originalIndex.get(b));
      below.forEach(mb => {
        const curPos = arr.indexOf(mb);
        if (curPos > anchorPos + 1) {
          // remove and insert right after current anchor block
          arr.splice(curPos, 1);
          anchorPos++;
          arr.splice(anchorPos, 0, mb);
        }
      });
    });
    // Rebuild packed with new lane indices
    if (arr.some((it, idx) => it !== packed[idx])) {
      packed = arr.map((it, idx) => ({ ...it, _lane: idx }));
      laneCount = packed.length;
    }

    // Build grouping metadata for rendering (anchor/button and border frames)
    // New: draw a single frame per group spanning from min to max lane across the canvas.
    // Use a stable signature string for map keys so lookups work after we rebuild `packed`.
    const itemSig = (x) => `${x.name}__${x._sC?.toISOString?.() || ''}__${x._eC?.toISOString?.() || ''}`;
    const groupingMeta = new Map(); // key: itemSig -> { groupId, isAnchor, size, items }
    const clusterRanges = []; // [{ topLane, bottomLane, groupId, items }]
    const anchorLaneByGroup = new Map(); // groupId -> anchor lane (top-most)
    const laneOf = (orig) => {
      const s = itemSig(orig);
      const hit = packed.find(p => itemSig(p) === s);
      return (hit && typeof hit._lane === 'number') ? hit._lane : orig._lane;
    };
    groupToItems.forEach((set, og) => {
      const items = Array.from(set);
      if (items.length <= 1) return;

      // Determine lanes after reorder
      const lanes = items
        .map(it => laneOf(it))
        .filter(v => typeof v === 'number')
        .sort((a, b) => a - b);
      if (!lanes.length) return;

      const topLane = lanes[0];
      const bottomLane = lanes[lanes.length - 1];
      clusterRanges.push({ topLane, bottomLane, groupId: og, items });
      anchorLaneByGroup.set(og, topLane);

      // Mark members, only anchor shows consolidated button and orders
      items.forEach(it => {
        const isAnchor = laneOf(it) === topLane;
        groupingMeta.set(itemSig(it), { groupId: og, isAnchor, size: items.length, items });
      });
    });

    // Set der Gruppen-IDs, die mehrere Vorgänge umfassen (zur Deduplizierung links)
    const multiMemberGroupIds = new Set();
    groupToItems.forEach((set, og) => { if ((set?.size || 0) > 1) multiMemberGroupIds.add(og); });

const BAR_H = 28;
const V_GAP = 6;

// Zusätzliche Zahlungen-Zeile pro Zeile/Lane
const PAY_LANE_H = 32; // Höhe der Payments-Zeile (erhöht für mehr vertikalen Abstand)
const PAY_GAP    = 10; // Abstand zwischen Payments-Zeile und Balken (leicht erhöht)
const PAY_PILL_H = 26; // Höhe der Payment-Badge (für Linien-Offset)

// --- Keine Wiederholung des Vorgangs: pro Item genau ein Balken ---
// Separate Zahlungen-Reihe pro Basis-Lane (aggregiert über alle Aufträge eines Items)
// 1) Ermitteln, wie viele Auftrags-Zeilen pro Basis-Lane benötigt werden
//    (maximale Anzahl von Aufträgen eines Items in dieser Lane)
const ordersCountForLane = Array.from({ length: laneCount }, () => 0);
for (let idx = 0; idx < packed.length; idx++) {
  const it = packed[idx];
  // Zähle nur die Aufträge, die in dieser Lane tatsächlich Zahlungen im sichtbaren Fenster haben
  const orders = getOrdersFor(g, it) || [];
  const countVisiblePayOrders = orders.reduce((acc, o) => {
    const pays = Array.isArray(o?.zahlungen) ? o.zahlungen : [];
    // mind. eine Zahlung innerhalb des Fensters?
    const hasVisible = pays.some(z => {
      const d = new Date(z.datum);
      return d >= from && d <= to;
    });
    return acc + (hasVisible ? 1 : 0);
  }, 0);
  if (countVisiblePayOrders > ordersCountForLane[it._lane]) {
    ordersCountForLane[it._lane] = countVisiblePayOrders;
  }
}

// 2) Höhe/Offsets: Für jede Basis-Lane Platz über dem Balken für alle Auftrags-Zahlungszeilen reservieren
const basePayOffsets = ordersCountForLane.map(cnt => cnt > 0 ? (cnt * PAY_LANE_H + PAY_GAP) : 0);
const beforeLaneOffset = [];
{ let acc = 0; for (let i = 0; i < laneCount; i++) { const off = (basePayOffsets[i] || 0); beforeLaneOffset[i] = acc + off; acc += off; } }
const getLaneTop = (lane) => ROW_PAD + msBlockH + beforeLaneOffset[lane] + lane * (BAR_H + V_GAP);

const extraSpace = basePayOffsets.reduce((s, v) => s + (v || 0), 0);
const barsHeight = ROW_PAD * 2 + laneCount * BAR_H + Math.max(0, laneCount - 1) * V_GAP + extraSpace;

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



// Separatoren: horizontale Linien unter Prozessen mit Aufträgen (links+rechts durchgehend)
let procSeparators = packed
  .filter(it => (it.durationDays || 0) > 0)
  .map(it => {
    const orders = getOrdersFor(g, it) || [];
    if (!orders.length) return null;
    return getLaneTop(it._lane) + BAR_H;
  })
  .filter((v) => typeof v === "number");
// deduplizieren
procSeparators = Array.from(new Set(procSeparators)).sort((a,b)=>a-b);

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
  {/* Gruppierungsrahmen links */}
  {clusterRanges.map((cr, i) => {
    const top = getLaneTop(cr.topLane) - 2;
    const bottom = getLaneTop(cr.bottomLane) + BAR_H + 2;
    const height = Math.max(8, bottom - top);
    return (
      <div key={`grp-left-${i}`}
           className="absolute pointer-events-none"
           style={{ left: 6, right: 6, top: top, height, border: "2px dashed #00e0d6", borderRadius: 8 }} />
    );
  })}

{/* linke (sticky) Zelle – Aufträge je Prozess, vertikal ausgerichtet */}
<div
  data-lefttext
  style={{ position: "relative", height: rowHeight }}
>
  {procSeparators.map((y, si) => (
    <div key={`lsep-${rowIdx}-${si}`} className="absolute" style={{ left: 0, right: 0, top: y, height: 1, background: "#e5e7eb", pointerEvents: "none" }} />
  ))}
  {packed.filter(it => (it.durationDays || 0) > 0).map((it, idx) => {
    const top = getLaneTop(it._lane);
    const meta = groupingMeta.get(itemSig(it));
    // Nicht-Anker-Items zeigen keine eigene Auftragsliste links
    let orders = (meta && !meta.isAnchor) ? [] : getOrdersFor(g, it);
    // Für Anker konsolidieren und deduplizieren wir die Aufträge der gesamten Gruppe
    if (meta && meta.isAnchor) {
      const seen = new Set();
      const all = [];
      meta.items.forEach(member => {
        const list = getOrdersFor(g, member) || [];
        list.forEach(o => {
          const id = o?.orderGroupId || `${o?.lieferant||''}|${o?.spe||''}|${o?.bestellnummer||''}|${o?.auftragsnummer||''}|${o?.plankosten||''}`;
          if (!seen.has(id)) { seen.add(id); all.push(o); }
        });
      });
      orders = all;
    } else if (!meta && orders && orders.length) {
      // Falls dieser Vorgang Teil einer Gruppe ist, die mehrere Mitglieder hat,
      // aber hier (durch Fallback-Mapping) nicht als solche erkannt wurde,
      // filtere gruppierte Aufträge heraus, damit sie nur beim Anker erscheinen.
      orders = orders.filter(o => !multiMemberGroupIds.has(o?.orderGroupId || sign(o)));
    }
    const hasOrders = (meta ? true : orders.length > 0);
    const orderCount = orders.length;

    // Position für die obere Info-Zeile(n) – gesamte Höhe je nach maximaler Auftragszahl der Lane
    const totalInfoH = (ordersCountForLane[it._lane] || 0) * PAY_LANE_H;
    const infoTop = getLaneTop(it._lane) - (PAY_GAP + totalInfoH);

    return (
      <React.Fragment key={`leftwrap-${idx}`}>
        {/* Lieferantenliste (eine Zeile pro Auftrag) oberhalb des Vorgangsnamens */}
        {hasOrders && (
          <div
            key={`left-info-${idx}`}
            style={{ position: "absolute", left: 12, right: 12, top: infoTop, height: totalInfoH, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 2 }}
          >
            {orders.map((o, oi) => {
              const baseS = o.procPlannedStart ? new Date(o.procPlannedStart) : null;
              const baseE = o.procPlannedEnd ? new Date(o.procPlannedEnd) : null;
              const curS = it._sC || it.start || null;
              const curE = it._eC || it.end || null;
              const mismatch = !!(
                (baseS && curS && startOfDay(baseS).getTime() !== startOfDay(curS).getTime()) ||
                (baseE && curE && startOfDay(baseE).getTime() !== startOfDay(curE).getTime())
              );
              const tip = mismatch ? `Prozessdaten geändert: geplant ${fmtDM(baseS)}–${fmtDM(baseE)} → aktuell ${fmtDM(curS)}–${fmtDM(curE)}` : '';
              return (
                <div key={oi} className="text-[13px] truncate flex items-center gap-2" style={{ height: PAY_LANE_H, lineHeight: `${PAY_LANE_H}px` }} title={tip}>
                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    <FaCheck className="text-emerald-700" size={10} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Auftrag</span>
                  </span>
                  <span className="text-slate-800">
                    {(o.lieferant || "Lieferant")} · {formatEuro(o.plankosten)}
                  </span>
                  {mismatch && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-red-500 text-white font-semibold">Abweichung</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Zeile am Balken: nur Vorgangsname + Button */}
        <div key={`left-${idx}`} style={{ position: "absolute", left: 12, right: 12, top, height: BAR_H, display: "flex", alignItems: "center", gap: 8 }} onMouseDown={(e)=>toggleSelectProc(g,it,e)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-[13px] text-slate-900 truncate flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                <FaCalendarAlt className="text-sky-700" size={10} />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Vorgang</span>
              </span>
              <span className="truncate">{it.name}</span>
              {!hasOrders && (
                <span className="text-[12px] text-slate-400 italic flex-shrink-0">· Kein Auftrag</span>
              )}
            </div>
          </div>
          {(() => {
            const meta = groupingMeta.get(itemSig(it));
            if (meta && !meta.isAnchor) {
              // Teil der Gruppe, aber nicht Anker: keinen eigenen Button zeigen
              return null;
            }
            if (meta && meta.isAnchor) {
              return (
                <button
                  onClick={() => openGroupAuftragModal(g, meta.items)}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ background: "#00e0d6", color: "#000" }}
                  title={`Auftrag für ${meta.size} Vorgänge öffnen`}
                >
                  Auftrag ({meta.size})
                </button>
              );
            }
            return (
              <button
                onClick={() => openAuftragModal(g, it)}
                className="px-2 py-1 rounded text-xs font-medium"
                style={{ background: hasOrders ? "#e2e8f0" : "#00e0d6", color: hasOrders ? "#0f172a" : "#000" }}
                title={hasOrders ? "Aufträge verwalten" : "Auftrag anlegen"}
              >
                {hasOrders ? "Aufträge" : "+ Auftrag"}
              </button>
            );
          })()}
        </div>
      </React.Fragment>
    );
  })}
</div>

</div>



        {/* rechte Zelle: Timeline-Row */}
        <div
          className="relative"
          style={{ height: rowHeight, borderBottom: "1px solid #e5e7eb" }}
        >
          {/* Gruppierungsrahmen rechts (Timeline) */}
          {clusterRanges.map((cr, i) => {
            const top = getLaneTop(cr.topLane) - 2;
            const bottom = getLaneTop(cr.bottomLane) + BAR_H + 2;
            const height = Math.max(8, bottom - top);
            return (
              <div key={`grp-right-${i}`}
                   className="absolute pointer-events-none"
                   style={{ left: 4, right: 4, top: top, height, border: "2px dashed #00e0d6", borderRadius: 8 }} />
            );
          })}
          {/* Wochenbänder in der Zeile */}
          {weekBands.map((b, i) => (
            <div
              key={`wb-r-${rowIdx}-${i}`}
              className={`absolute top-0 bottom-0 ${b.even ? "bg-slate-50" : "bg-white"}`}
              style={{ left: b.startIdx * dayWidth, width: b.span * dayWidth }}
            />
          ))}


          {/* Monats-Trenner in der Row */}
          {monthBoundaries.map((idx) => (
            <div
              key={`mline-row-${rowIdx}-${idx}`}
              className="absolute top-0 bottom-0 month-divider"
              style={{ left: idx * dayWidth }}
            />
          ))}

          {/* Heute-Linie */}
          <div
            className="absolute top-0 bottom-0 border-l-2 border-[#ff5a5f] z-10"
            style={{ left: todayOffset }}
          />

          {/* Prozess-Separators (nur wenn Aufträge vorhanden) */}
          {procSeparators.map((y, si) => (
            <div key={`rsep-${rowIdx}-${si}`} className="absolute" style={{ left: 0, right: 0, top: y, height: 1, background: "#e5e7eb", pointerEvents: "none", zIndex: 1 }} />
          ))}

          {/* Prozessbalken (ohne Überlappung, dank Lanes) */}
{/* 1) Meilensteine separat rendern (einmal pro Item) */}
{packed.map((it, i) => {
  const isMilestone = (it.durationDays || 0) === 0;
  if (!isMilestone) return null;
  const layout = msLayout.get(i); // aus dem Prepass
  const cx = diffDays(from, it._sC) * dayWidth + dayWidth / 2;
  const msTop = ROW_PAD + (layout ? layout.lane : 0) * (LABEL_H + V_GAP);

  const isDone = it.done || it.status === 1 || it.progress === 100;
  const isOverdue = !isDone && it._sC < today;
  const type = isDone ? "completed" : (isOverdue ? "overdue" : "upcoming");

  const outerDiamondColor = it.color || "#3fbcf0"; 
  const innerDiamondColor = darkenColor(outerDiamondColor, 30); 
  const pillBgColor = getLightColor(type, outerDiamondColor); 

  const pillLeft  = layout ? layout.left  : (cx + MS / 2 + PAD);
  const pillWidth = layout ? layout.width : Math.max(LABEL_W_MIN, Math.min(LABEL_W, timelineWidth - (cx + MS / 2 + PAD)));

  return (
    <div key={`ms-${rowIdx}-${i}`}>
      {/* Pill Container */}
      <div
        className="absolute"
        style={{
          left:  cx,
          top:   msTop,
          width: pillWidth,
          height: LABEL_H,
          background: pillBgColor,
          borderRadius: 6,
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* Label Text */}
      <div
        className="absolute"
        style={{
          left:  cx + 24,
          top:   msTop,
          width: pillWidth - 24,
          height: LABEL_H,
          display: "flex",
          alignItems: "center",
          color: "black",
          fontWeight: 600,
          fontSize: 11,
          fontFamily: "Inter, sans-serif",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          zIndex: 3,
          pointerEvents: "none",
        }}
      >
        {it.name}
      </div>

      {/* Diamond (Raute) */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: cx - 9,
          top:  msTop + (LABEL_H - 18) / 2,
          width: 18,
          height: 18,
          backgroundColor: outerDiamondColor,
          transform: "rotate(45deg)",
          borderRadius: 4,
          zIndex: 4,
        }}
        title={`${it.name}\n${fmtShort(it.start)} → ${fmtShort(it.end)}\n${it.trade || ""}`}
      >
        {/* Inner Diamond & Icon */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 15,
            height: 15,
            backgroundColor: innerDiamondColor,
            borderRadius: 3,
            transform: "rotate(0deg)", // bleibt relativ zur äußeren Raute
          }}
        >
          {/* Icons (nicht rotieren, damit sie gerade stehen) */}
          <div style={{ transform: "rotate(-45deg)", display: "flex", alignItems: "center", justifyCenter: "center" }}>
            {type === "completed" && (
               <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                 <path d="M 2 6 L 5 9 L 10 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
               </svg>
            )}
            {type === "overdue" && (
              <span style={{ color: "white", fontSize: "12px", fontWeight: "900", fontFamily: "Inter, sans-serif" }}>!</span>
            )}
            {type !== "completed" && type !== "overdue" && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="4" stroke="white" strokeWidth="1.5" />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
})}

{/* 2) Ein Balken pro Item, Zahlungen in eigener Zeile darüber (aggregiert) */}
{packed.filter(it => (it.durationDays || 0) > 0).map((it, i) => {
  const left = Math.max(0, diffDays(from, it._sC)) * dayWidth + 3;
  const width = Math.max(6, (diffDays(it._sC, it._eC) + 1) * dayWidth - 6);
  const top = getLaneTop(it._lane);

  const orders = getOrdersFor(g, it);
  const isSelected = selectedProcKeys.has(procKey(g, it));

  // Zahlungs-Knoten pro Auftrag in eigener Zeile
  const paymentNodes = (() => {
    if (!orders || orders.length === 0) return null;

    const cntForLane = ordersCountForLane[it._lane] || 0;
    const totalPayH = cntForLane * PAY_LANE_H; // gesamte reservierte Payments-Höhe für diese Lane
    const baseTop = getLaneTop(it._lane) - (PAY_GAP + totalPayH); // oberster Rand des Payment-Bereichs

    const nodes = [];
    orders.forEach((o, oi) => {
      const pays = Array.isArray(o?.zahlungen) ? o.zahlungen : [];
      if (!pays.length) return; // keine Zahlungen → nichts rendern (Zeile bleibt leer)
      const payTop = baseTop + oi * PAY_LANE_H;

      // Abweichung pro Auftrag bestimmen (wie beim Lieferanten-Badge)
      const baseS = o.procPlannedStart ? new Date(o.procPlannedStart) : null;
      const baseE = o.procPlannedEnd ? new Date(o.procPlannedEnd) : null;
      const curS = it._sC || it.start || null;
      const curE = it._eC || it.end || null;
      const mismatch = !!(
        (baseS && curS && startOfDay(baseS).getTime() !== startOfDay(curS).getTime()) ||
        (baseE && curE && startOfDay(baseE).getTime() !== startOfDay(curE).getTime())
      );

      pays.forEach((z, zi) => {
        const zDate = new Date(z.datum);
        // Zahlungen außerhalb des sichtbaren Canvas nicht anzeigen
        if (!(zDate >= from && zDate <= to)) return;
        const dx = diffDays(from, zDate);
        const leftCenter = dx * dayWidth + dayWidth / 2;
        const centerX = leftCenter;
        const barTop = top;
        const lineTop = Math.max(0, payTop + PAY_PILL_H + 4); // Linie startet unterhalb des Payment-Pills
        nodes.push(
          <React.Fragment key={`pay-${rowIdx}-${i}-${oi}-${zi}`}>
            <div
              className="absolute"
              style={{ left: centerX, top: lineTop, width: 1, height: Math.max(0, barTop - lineTop - 2), background: "rgba(100,116,139,0.45)", zIndex: 9, pointerEvents: "none" }}
            />
            <div
              className="absolute"
              style={{ left: leftCenter, top: payTop, transform: "translateX(-50%)", zIndex: 10, pointerEvents: "none", padding: "4px 10px", borderRadius: 10, background: "rgba(255,255,255,0.95)", border: mismatch ? "2px solid #ef4444" : "1px solid rgba(100,116,139,0.35)", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", color: "#0f172a", minWidth: 104, textAlign: "center" }}
              title={`${zDate.toLocaleDateString('de-DE')} · ${formatEuro(z.betrag)}`}
            >
              <div style={{fontWeight:700, lineHeight:1, fontSize:11}}>{formatEuro(z.betrag)}</div>
              <div style={{fontSize:9, opacity:.75, lineHeight:1, marginTop:2}}>{zDate.toLocaleDateString('de-DE')}</div>
            </div>
          </React.Fragment>
        );
      });
    });
    return nodes.length ? nodes : null;
  })();

  return (
    <React.Fragment key={`barwrap-${rowIdx}-${i}`}>
      {paymentNodes}
      <div
        className="absolute rounded-md shadow"
        onMouseDown={(e)=>toggleSelectProc(g,it,e)}
        style={{ left, width, top, height: BAR_H, backgroundColor: it.color, boxShadow: isSelected?"0 0 0 2px #00e0d6, 0 0 0 1px rgba(0,0,0,0.06)":"0 0 0 1px rgba(0,0,0,0.06)" }}
        title={`${it.name}
${fmtShort(it.start)} → ${fmtShort(it.end)}
${it.trade || ""}${(it.responsibles && it.responsibles.length) ? `\nResp: ${it.responsibles.join(", ")}` : ""}`}
      >
        {(() => {
          const hasResp = Array.isArray(it.responsibles) && it.responsibles.length > 0;
          const initials = hasResp ? initialsFromString(it.responsibles[0]) : "";
          const AVATAR = 20; const BADGE = 18; const GAP = 6;
          const reserve = (hasResp ? AVATAR + GAP : 0) + (it.done ? BADGE + GAP : 0);
          return (
            <>
              <div className="bar-label" style={{ position: "relative", display: "flex", alignItems: "center", height: "100%", padding: `0 ${Math.max(8, reserve + 8)}px 0 8px`, fontSize: 12, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: textColorForBg(it.color), pointerEvents: "none" }}>
                {it.name}
              </div>
              {hasResp && (
                <div className="absolute" style={{ right: it.done ? (GAP + BADGE + GAP) : GAP, top: (BAR_H - AVATAR) / 2, width: AVATAR, height: AVATAR, borderRadius: 9999, background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 1px 1px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.5) inset", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#0f172a", letterSpacing: ".02em", pointerEvents: "none" }} title={it.responsibles.join(", ")}>{initials}</div>
              )}
              {it.done && (
                <div className="absolute" style={{ right: GAP, top: (BAR_H - BADGE) / 2, width: BADGE, height: BADGE, borderRadius: 9999, background: "rgba(255,255,255,0.85)", boxShadow: "0 1px 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }} aria-hidden="true">
                  <FaCheck style={{ width: 12, height: 12, color: textColorForBg(it.color) === "#fff" ? "#16a34a" : "#15803d" }} />
                </div>
              )}
            </>
          );
        })()}
      </div>
    </React.Fragment>
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


      {/* Modal: Auftrag anlegen/bearbeiten */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white text-slate-950 p-6 rounded-lg w-full max-w-2xl shadow-2xl border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xl font-semibold tracking-tight">
                  {batchMode ? "Auftrag für mehrere Vorgänge" : ((editingIndex != null && editingIndex >= 0) ? "Auftrag bearbeiten" : "Neuen Auftrag anlegen")}
                </div>
                {batchMode && (
                  <div className="text-sm text-muted-foreground mt-1">
                    Auswahl: {batchList.length} Vorgänge
                  </div>
                )}
              </div>
              <button 
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-slate-950 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
              </button>
            </div>

            {!batchMode && (
              <div className="text-sm bg-slate-50 border rounded-md p-3 mb-6 text-slate-600">
                Vorgang: <span className="font-semibold text-slate-900">{selectedProcCtx?.procName || "–"}</span>
                {Number.isFinite(Number(selectedProcCtx?.durationDays)) && Number(selectedProcCtx?.durationDays) > 0 ? (
                  <span> · Dauer: <span className="font-semibold text-slate-900">{Number(selectedProcCtx.durationDays)} AT</span></span>
                ) : null}
              </div>
            )}

            {/* Existierende Aufträge für diesen Vorgang */}
            {(() => {
              if (batchMode) return null;
              const list = selectedProcCtx ? getOrdersFor({ key: selectedProcCtx.groupKey }, { name: selectedProcCtx.procName, start: selectedProcCtx.start, end: selectedProcCtx.end }) : [];
              if (!list.length) return null;
              return (
                <div className="mb-6 p-4 rounded-md bg-slate-50 border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold">Bestehende Aufträge ({list.length})</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setEditingIndex(-1);
                        const defPays = selectedProcCtx?.end ? [{ datum: selectedProcCtx.end, betrag: Number("") || 0 }] : [];
                        setForm({ lieferant: "", spe: "", bestellnummer: "", auftragsnummer: "", plankosten: "", istkosten: "", zahlungen: defPays });
                        setZahlungsart("einmalig");
                      }}
                    >
                      Neuer Auftrag
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {list.map((o, idx) => (
                      <div key={idx} className={cn("flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors", editingIndex === idx ? "bg-white border-primary/50 shadow-sm" : "bg-white/50 border-transparent")}>
                        <div className="truncate pr-4">
                          <span className="font-medium text-slate-900">{o.lieferant || "–"}</span>
                          <span className="text-muted-foreground ml-2">({formatEuro(o.plankosten)})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setEditingIndex(idx);
                              setForm({
                                lieferant: o.lieferant || "",
                                spe: o.spe || "",
                                bestellnummer: o.bestellnummer || "",
                                auftragsnummer: o.auftragsnummer || "",
                                plankosten: o.plankosten || "",
                                istkosten: o.istkosten || "",
                                zahlungen: o.zahlungen || [],
                              });
                              setZahlungsart((o.zahlungen && o.zahlungen.length > 1) ? "mehrfach" : "einmalig");
                            }}
                          >Bearbeiten</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteAuftrag(idx)}
                          >Löschen</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="lieferant">Lieferant</Label>
                <Input 
                  id="lieferant"
                  placeholder="Name des Lieferanten"
                  value={form.lieferant} 
                  onChange={e=>setForm({...form, lieferant:e.target.value})} 
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="spe">SPE / Position</Label>
                <Input 
                  id="spe"
                  placeholder="SPE / Position angeben"
                  value={form.spe} 
                  onChange={e=>setForm({...form, spe:e.target.value})} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="bestellnummer">Bestellnummer</Label>
                  <Input 
                    id="bestellnummer"
                    placeholder="Bestellnummer"
                    value={form.bestellnummer} 
                    onChange={e=>setForm({...form, bestellnummer:e.target.value})} 
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="auftragsnummer">Auftragsnummer SAP</Label>
                  <Input 
                    id="auftragsnummer"
                    placeholder="SAP Nummer"
                    value={form.auftragsnummer} 
                    onChange={e=>setForm({...form, auftragsnummer:e.target.value})} 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="plankosten">Plan-Kosten (€)</Label>
                  <Input 
                    id="plankosten"
                    placeholder="0,00"
                    value={form.plankosten} 
                    onChange={e=>setForm({...form, plankosten:e.target.value})} 
                    onBlur={e=>setForm({...form, plankosten: String(parseEuro(e.target.value))})} 
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="istkosten">Ist-Kosten (€)</Label>
                  <Input 
                    id="istkosten"
                    value={formatEuro(form.istkosten)} 
                    readOnly 
                    className="bg-slate-50 text-muted-foreground cursor-not-allowed"
                  />
                </div>
              </div>

              {batchMode && (
                <div className="mt-2 p-4 rounded-md border bg-slate-50/50">
                  <div className="mb-1 font-semibold text-sm">Prozentuale Verteilung je Vorgang</div>
                  <div className="text-xs text-muted-foreground mb-4">Passe hier die Anteile in % an. Die Summe wird auf 100% normalisiert.</div>
                  <div className="grid gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {batchList.map((p, i) => {
                      const total = parseEuro(form.plankosten) || 0;
                      const sumPct = batchList.reduce((acc, x) => acc + (Number(procShares[x.key]) || 0), 0);
                      const pct = Number(procShares[p.key]) || 0;
                      const amount = sumPct > 0 ? (total * (pct / sumPct)) : 0;
                      return (
                        <div key={p.key} className="flex items-center gap-4 py-1">
                          <div className="flex-1 truncate text-sm font-medium" title={`${p.procName}`}>
                            {p.procName}
                            {Number.isFinite(Number(p.durationDays)) && Number(p.durationDays) > 0 ? (
                              <span className="text-muted-foreground font-normal ml-1">({Number(p.durationDays)} AT)</span>
                            ) : ""}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step={0.1}
                              min={0}
                              className="w-20 h-8 text-right px-2"
                              value={Number.isFinite(Number(procShares[p.key])) ? procShares[p.key] : ""}
                              onChange={e=>{
                                const v = e.target.value === '' ? '' : Math.max(0, Number(e.target.value)||0);
                                setProcShares(ps=>({ ...ps, [p.key]: v }));
                              }}
                            />
                            <span className="text-sm text-muted-foreground w-4">%</span>
                          </div>
                          <div className="text-sm font-medium text-slate-700 min-w-[90px] text-right">
                            {sumPct > 0 ? formatEuro(amount) : '–'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-sm font-semibold">
                      Gesamt: {(() => {
                        const s = batchList.reduce((acc, p) => acc + (Number(procShares[p.key])||0), 0);
                        return `${Math.round(s*10)/10} %`;
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={()=>{
                          const eq = batchList.length ? (100/batchList.length) : 0;
                          const obj = {};
                          batchList.forEach(p=>{ obj[p.key] = Math.round(eq*10)/10; });
                          setProcShares(obj);
                        }}
                      >Gleich verteilen</Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={()=>{
                          const ds = batchList.map(p => {
                            const d = Number(p.durationDays);
                            return Number.isFinite(d) && d > 0 ? d : 0;
                          });
                          const sum = ds.reduce((a,b)=>a+b,0);
                          const obj = {};
                          if (sum > 0) ds.forEach((d,i)=>{ obj[batchList[i].key] = Math.round((d/sum)*1000)/10; });
                          else batchList.forEach(p=>{ obj[p.key] = 0; });
                          setProcShares(obj);
                        }}
                      >Nach Dauer</Button>
                    </div>
                  </div>
                </div>
              )}

              {selectedProcCtx?.start && selectedProcCtx?.end && (
                <div className="mt-2 p-4 rounded-md border bg-slate-50/50">
                  <div className="mb-3 font-semibold text-sm">Zahlungsart</div>
                  <div className="flex items-center gap-6 mb-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input className="h-4 w-4 text-primary border-slate-300 focus:ring-primary" type="radio" checked={zahlungsart==="einmalig"} onChange={()=>{setZahlungsart("einmalig"); setForm(f=>({...f, zahlungen: selectedProcCtx.end ? [{ datum: selectedProcCtx.end, betrag: Number(f.plankosten)||0 }] : []}))}} />
                      <span>Einmalig (am Ende)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input className="h-4 w-4 text-primary border-slate-300 focus:ring-primary" type="radio" checked={zahlungsart==="mehrfach"} onChange={()=>{setZahlungsart("mehrfach"); }} />
                      <span>Mehrfach</span>
                    </label>
                  </div>

                  {zahlungsart === "mehrfach" && (
                    <div className="flex items-end gap-3 mb-4">
                      <div className="grid gap-1.5">
                        <Label htmlFor="anzahlZahlungen">Anzahl Zahlungen</Label>
                        <Input 
                          id="anzahlZahlungen"
                          type="number" 
                          min={2} 
                          value={anzahlZahlungen} 
                          onChange={e=>setAnzahlZahlungen(Number(e.target.value)||2)} 
                          className="w-32 h-9"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={()=>{
                          if(!(selectedProcCtx?.start && selectedProcCtx?.end)) return;
                          const duration = selectedProcCtx.end.getTime() - selectedProcCtx.start.getTime();
                          const step = duration / Math.max(1,(anzahlZahlungen-1));
                          const betrag = Math.round(((Number(form.plankosten)||0)/Math.max(1,anzahlZahlungen))*100)/100;
                          const neue = Array.from({length: Math.max(2,anzahlZahlungen)}).map((_,i)=>({ datum:new Date(selectedProcCtx.start.getTime()+i*step), betrag }));
                          setForm(f=>({...f, zahlungen: neue}));
                        }}
                      >Verteilen</Button>
                    </div>
                  )}

                  {/* Zahlungen Liste */}
                  <div className="grid gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {(form.zahlungen||[]).map((z, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Input 
                          type="date" 
                          value={new Date(z.datum).toISOString().slice(0,10)} 
                          onChange={e=>{
                            const copy = [...(form.zahlungen||[])];
                            copy[idx] = { ...copy[idx], datum: new Date(e.target.value) };
                            setForm({ ...form, zahlungen: copy });
                          }} 
                          className="h-9"
                        />
                        <div className="relative flex-1">
                          <Input 
                            type="number" 
                            step="0.01" 
                            value={z.betrag} 
                            onChange={e=>{
                              const copy = [...(form.zahlungen||[])];
                              copy[idx] = { ...copy[idx], betrag: Number(e.target.value)||0 };
                              setForm({ ...form, zahlungen: copy });
                            }} 
                            className="h-9 pl-7"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center gap-3 mt-8 pt-4 border-t">
              <div>
                {(editingIndex != null && editingIndex >= 0) && (
                  <Button
                    variant="destructive"
                    onClick={() => deleteAuftrag(editingIndex)}
                    title="Diesen Auftrag löschen"
                  >
                    Löschen
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline"
                  onClick={()=>{ setModalOpen(false); setProcShares({}); }}
                >
                  Abbrechen
                </Button>
                <Button 
                  className="bg-[#00e0d6] text-black hover:bg-[#00c9c0]"
                  onClick={saveAuftrag}
                >
                  Speichern
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* kleine Legende */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mt-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#ff5a5f]" />
          Heute
        </div>
      </div>
    </div>
  );
}
