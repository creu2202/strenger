import React, { useMemo, useState } from "react";
import { FaFlagCheckered, FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";
import { motion } from "framer-motion";
import { scaleTime, scaleBand } from "@visx/scale";
import { Group } from "@visx/group";
import { Line } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import ParentSize from "@visx/responsive/lib/components/ParentSize";
import { tooltipStyles, tooltipHeaderStyle } from "./tooltipStyles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";

const DURATION_KEYS = ["Duration", "Dauer", "Dauer [d]", "Duration (d)"];

const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) return val;
  const num = Number(val);
  if (!isNaN(num) && num > 40000) { // Excel-Serienzahl
    const utc_days = Math.floor(num - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  }
  const d = new Date(val);
  return isNaN(d) ? null : d;
};

  const MilestoneChart = ({ data, milestoneData, projectOffsets, width, height, margin, today, filter, showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, getColor, getLightColor, renderLcmMilestone }) => {
  const xMax = Math.max(800, width - margin.left - margin.right);
  const yMax = height - margin.top - margin.bottom;

  const xScale = scaleTime({
    domain: [
      Math.min(...data.map((d) => d.date.getTime())) - 86400000 * 7, // 1 Woche Puffer links
      Math.max(...data.map((d) => d.date.getTime())) + 86400000 * 14, // 2 Wochen Puffer rechts
    ],
    range: [0, xMax],
  });

  const yScale = useMemo(() => {
    return (projectName) => {
      return projectOffsets.offsets[projectName] || 0;
    };
  }, [projectOffsets]);

  // Sortiere Daten, damit Meilensteine mit höherem indexInDate oben liegen (für Überlagerungen)
  const sortedData = [...data].sort((a, b) => (a.indexInDate || 0) - (b.indexInDate || 0));

  return (
    <div className="relative overflow-x-auto rounded-md border bg-card">
      <svg 
        width={width} 
        height={projectOffsets.totalHeight + margin.top + margin.bottom} 
        className="min-w-full overflow-visible"
        onMouseLeave={hideTooltip}
      >
        <Group left={margin.left} top={margin.top}>
          {/* Grid Lines für bessere Orientierung */}
          {xScale.ticks(width > 800 ? 10 : 5).map((d, i) => (
            <line
              key={`grid-${i}`}
              x1={xScale(d)}
              y1={0}
              x2={xScale(d)}
              y2={projectOffsets.totalHeight}
              stroke="hsl(var(--muted))"
              strokeWidth={1}
              strokeDasharray="4,4"
              opacity={0.4}
            />
          ))}

          <AxisBottom
            top={projectOffsets.totalHeight}
            scale={xScale}
            stroke="hsl(var(--muted-foreground))"
            tickFormat={(d) => new Date(d).toLocaleDateString("de-DE", { day: '2-digit', month: '2-digit' })}
            tickLabelProps={() => ({ 
              fill: "hsl(var(--muted-foreground))", 
              fontSize: 12, 
              textAnchor: "middle",
              fontFamily: "Inter, sans-serif"
            })}
          />
          
          {/* Obere Zeitleiste für bessere Übersicht */}
          <AxisBottom
            top={0}
            scale={xScale}
            stroke="hsl(var(--muted-foreground))"
            hideTicks
            tickFormat={(d) => new Date(d).toLocaleDateString("de-DE", { day: '2-digit', month: '2-digit' })}
            tickLabelProps={() => ({ 
              fill: "hsl(var(--muted-foreground))", 
              fontSize: 12, 
              textAnchor: "middle",
              fontFamily: "Inter, sans-serif",
              dy: "-1.8em"
            })}
          />

          {/* Manuelle Projekt-Labels an der linken Seite */}
          {Object.entries(projectOffsets.offsets).map(([name, offset]) => (
            <text
              key={name}
              x={-10}
              y={offset + 35}
              fill="hsl(var(--foreground))"
              fontSize={13}
              textAnchor="end"
              alignmentBaseline="middle"
              className="font-medium"
            >
              {name.length > 20 ? name.substring(0, 17) + "..." : name}
            </text>
          ))}
          {sortedData.map((d) => {
            const x = xScale(d.date.getTime());
            const y = yScale(d.project) + 35; // Erhöht von 25px auf 35px Padding, um Abstand zur Zeitleiste zu gewinnen
            return renderLcmMilestone(d, x, y);
          })}
          
          {/* Heute-Linie mit Label wie im Fortschritt/Gantt */}
          <Line
            from={{ x: xScale(today.getTime()), y: 0 }}
            to={{ x: xScale(today.getTime()), y: projectOffsets.totalHeight }}
            stroke="#6b7280"
            strokeWidth={2}
            strokeDasharray="4,4"
            className="drop-shadow-sm"
          />
          <text
            x={xScale(today.getTime())}
            y={-35}
            fill="hsl(var(--muted-foreground))"
            fontSize={12}
            textAnchor="middle"
            fontWeight="500"
            fontFamily="Inter, sans-serif"
          >
            Heute ({today.toLocaleDateString("de-DE", { day: '2-digit', month: '2-digit' })})
          </text>
        </Group>
      </svg>
      {tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={{
            ...tooltipStyles,
            backgroundColor: "#ffffff",
            color: "#0f172a",
            boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
            padding: "0.75rem",
          }}
        >
          <div className="text-sm flex flex-col gap-1.5 min-w-[180px]">
            <strong className="text-slate-900 border-b border-slate-100 pb-1.5 mb-0.5 block font-bold leading-tight" style={tooltipHeaderStyle}>
              {tooltipData.project}
            </strong>
            <div className="space-y-1.5 mt-0.5">
              <div className="flex items-start gap-2 text-slate-700 leading-tight">
                <span className="text-base shrink-0">📌</span> 
                <span className="font-medium text-[13px]">{tooltipData.process}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span className="text-base shrink-0">🧰</span> 
                <span className="text-xs">{tooltipData.trade}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span className="text-base shrink-0">📅</span> 
                <span className="text-xs font-semibold text-slate-900">{tooltipData.date.toLocaleDateString("de-DE")}</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-50 mt-1">
                <span className="text-base shrink-0">⏳</span> 
                <span className="text-xs font-bold text-blue-600">{tooltipData.daysUntilDue} Tage bis Fälligkeit</span>
              </div>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
};

const RESPONSIBLE_KEYS = [
  "Responsibles", "Responsible", "Verantwortlich", "Verantwortliche", "Verantwortliche(r)"
];
const parseResponsibles = (val) => {
  if (val == null && val !== 0) return [];
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
  const s = String(val);
  return s.split(/[\n,;\/|]+/g).map(t => t.trim()).filter(Boolean);
};

const Meilensteine = ({ data, projects, selectedProjects, gewerkFilter, bereichFilter, responsiblesFilter, searchTerm }) => {
  if (!data) return <p className="text-gray-400 text-lg">Keine Daten verfügbar...</p>;

  const today = new Date();
  const [filter, setFilter] = useState("all");
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip();
  const normalizedSearch = searchTerm?.toLowerCase().trim();

  const milestoneData = useMemo(() => {
    const list = [];
    const projectMaxOverlaps = {}; 

    // Sammle zuerst alle potenziellen Meilensteine
    const rawMilestones = [];

    Object.keys(data).forEach((projectName) => {
      if (selectedProjects.length > 0 && !selectedProjects.includes(projectName)) return;

      const projectMeta = projects.find((p) => p.name === projectName);
      if (!projectMeta) return;

      const jsonData = data[projectName];
      
      jsonData.forEach((row) => {
        const processName = (row["Process"] || "").toString();
        const tradeName = (row["Trade"] || "").toString();
        const id = (row["ID"] || "").toString();

        // --- FILTERS ---
        if (gewerkFilter && gewerkFilter.length > 0 && !gewerkFilter.includes(tradeName)) {
          return;
        }

        const rowBereich = row["Bereich"] || row["Area"] || "";
        const rowTaktLevel1 = row["TaktZone Level 1"] || "";
        const rowTaktLevel2 = row["TaktZone Level 2"] || "";
        const rowTaktLevel3 = row["TaktZone Level 3"] || "";
        const rowTaktLevel4 = row["TaktZone Level 4"] || "";

        const areas = [
          rowBereich,
          rowTaktLevel1,
          [rowTaktLevel1, rowTaktLevel2].filter(Boolean).join(" / "),
          [rowTaktLevel1, rowTaktLevel2, rowTaktLevel3].filter(Boolean).join(" / "),
          [rowTaktLevel1, rowTaktLevel2, rowTaktLevel3, rowTaktLevel4].filter(Boolean).join(" / ")
        ].filter(Boolean);

        if (bereichFilter && bereichFilter.length > 0) {
          const hasAreaMatch = areas.some(a => bereichFilter.includes(a));
          if (!hasAreaMatch) return;
        }

        if (responsiblesFilter && responsiblesFilter.length > 0) {
          const rowResponsibles = parseResponsibles(row.Responsibles ?? row.Responsible ?? row.Verantwortlich ?? row["Verantwortliche(r)"]);
          const hasRespMatch = rowResponsibles.some(r => responsiblesFilter.includes(r));
          if (!hasRespMatch) return;
        }
        // ---------------

        if (normalizedSearch) {
          const hit = 
            projectName.toLowerCase().includes(normalizedSearch) ||
            processName.toLowerCase().includes(normalizedSearch) ||
            tradeName.toLowerCase().includes(normalizedSearch) ||
            id.toLowerCase().includes(normalizedSearch);
          
          if (!hit) return;
        }

        const startDate = parseDate(row["Start Date"]);
        const endDate = parseDate(row["End Date"]);
        const progress = row["Status"] * 100;
        const daysUntilDue = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));

        let durationDays = null;
        for (const k of DURATION_KEYS) {
          const v = row[k];
          if (v != null && v !== "") {
            const num = Number(String(v).replace(",", "."));
            if (isFinite(num)) { durationDays = Math.max(0, Math.round(num)); break; }
          }
        }
        if (durationDays == null) {
          if (startDate && endDate) {
            const diff = Math.round((endDate.setHours(0,0,0,0) - startDate.setHours(0,0,0,0)) / 86400000);
            durationDays = Math.max(0, diff + 1);
          } else {
            durationDays = 0;
          }
        }

        if (durationDays === 0) {
          let milestoneType;
          if (progress === 100) {
            milestoneType = "completed";
          } else if (progress === 0 && startDate < today) {
            milestoneType = "overdue";
          } else if (progress === 0 && startDate >= today) {
            milestoneType = "upcoming";
          }
          
          if (filter === "overdue" && milestoneType !== "overdue") return;
          if (filter === "next8weeks" && !(daysUntilDue >= 0 && daysUntilDue <= 56)) return;

          rawMilestones.push({
            projectId: projectMeta.projectId,
            project: projectName,
            id: row["ID"],
            process: row["Process"],
            trade: row["Trade"],
            tradeColor: row["Trade Background Color"] || row["TradeColor"] || row["Trade Color"],
            date: startDate,
            daysUntilDue,
            milestoneType,
          });
        }
      });
    });

    // Sortiere nach Datum
    rawMilestones.sort((a, b) => a.date - b.date);

    // Gruppiere nach Projekt für Lane-Zuweisung
    const milestonesByProject = {};
    rawMilestones.forEach(m => {
      if (!milestonesByProject[m.project]) milestonesByProject[m.project] = [];
      milestonesByProject[m.project].push(m);
    });

    // Lane-Zuweisung pro Projekt
    // Wir schätzen die X-Position basierend auf dem Zeitbereich, um Überlappungen zu erkennen.
    // Da wir hier im useMemo die xScale noch nicht haben (sie hängt von der Breite ab),
    // nutzen wir die Zeitstempel direkt als Proxy für die Position.
    
    const allDates = rawMilestones.map(m => m.date.getTime());
    const minTime = Math.min(...allDates) - 86400000 * 7;
    const maxTime = Math.max(...allDates) + 86400000 * 14;
    const timeSpan = maxTime - minTime || 1;

    Object.keys(milestonesByProject).forEach(projectName => {
      const projectMilestones = milestonesByProject[projectName];
      const lanes = []; // Hält den Endzeitpunkt (inkl. Puffer) der Belegung pro Lane

      projectMilestones.forEach(m => {
        const labelText = m.process || "Meilenstein";
        const estimatedWidthPx = labelText.length * 9 + 60;
        
        // Wir rechnen die Breite in Zeit-Einheiten um. 
        // Wir nehmen an, dass das Chart ca. 1000px breit ist (xMax Schätzung).
        const estimatedTimeWidth = (estimatedWidthPx / 1000) * timeSpan;
        const startTime = m.date.getTime();
        const endTimeWithBuffer = startTime + estimatedTimeWidth + (timeSpan * 0.01); // 1% Puffer statt 2%

        let assignedLane = -1;
        for (let i = 0; i < lanes.length; i++) {
          if (lanes[i] < startTime) {
            assignedLane = i;
            lanes[i] = endTimeWithBuffer;
            break;
          }
        }

        if (assignedLane === -1) {
          assignedLane = lanes.length;
          lanes.push(endTimeWithBuffer);
        }

        m.indexInDate = assignedLane;
        list.push(m);
      });

      projectMaxOverlaps[projectName] = lanes.length;
    });

    return { list, projectMaxOverlaps };
  }, [data, projects, selectedProjects, filter, gewerkFilter]);

  // Berechne die kumulative Höhe für jedes Projekt
  const projectOffsets = useMemo(() => {
    const offsets = {};
    let currentOffset = 0;
    const projectNames = [...new Set(milestoneData.list.map(d => d.project))];
    
    projectNames.forEach(name => {
      offsets[name] = currentOffset;
      const overlaps = milestoneData.projectMaxOverlaps[name] || 1;
      currentOffset += Math.max(1, overlaps) * 35 + 20; // Reduziert von 45px/25px auf 35px pro Zeile + 20px Padding
    });
    
    return { offsets, totalHeight: Math.max(400, currentOffset + 40) }; // Mindesthöhe von 500 auf 400 reduziert
  }, [milestoneData]);

  const margin = { top: 80, right: 100, bottom: 60, left: 180 };

  const getColor = (type, tradeColor) => {
    if (tradeColor) return tradeColor;
    if (type === "completed") return "#10b981"; // Teal/Green aus Fortschritt
    if (type === "overdue") return "#ef4444";   // Red aus Fortschritt
    return "#3b82f6"; // Blue (onTrack) für geplante Meilensteine
  };

  const darkenColor = (hex, amount) => {
    if (!hex) return "#000000";
    const parsed = parseAnyColor(hex);
    if (!parsed) return "#000000";
    
    // Blend over white if it has transparency
    const { r, g, b } = blendOverWhite(parsed);
    
    let dr = Math.max(0, r - amount);
    let dg = Math.max(0, g - amount);
    let db = Math.max(0, b - amount);
    
    return "#" + (dr << 16 | dg << 8 | db).toString(16).padStart(6, "0");
  };

  const getLightColor = (type, tradeColor) => {
    if (tradeColor) {
      if (tradeColor.startsWith("#")) {
        const baseColor = tradeColor.length > 7 ? tradeColor.substring(0, 7) : tradeColor;
        return baseColor + "26"; // Etwas weniger hell (ca. 15% Deckkraft, vorher 5% / "0D")
      }
      // Falls es ein RGB/HSL String ist, versuchen wir ihn zu parsen und mit geringer Opacity zurückzugeben
      const parsed = parseAnyColor(tradeColor);
      if (parsed) {
        return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.15)`;
      }
      return tradeColor;
    }
    // Fallbacks für Standard-Status (ohne Gewerkefarbe)
    if (type === "completed") return "rgba(16, 185, 129, 0.15)";
    if (type === "overdue") return "rgba(239, 68, 68, 0.15)";
    return "rgba(59, 130, 246, 0.15)";
  };

  const parseHex = (s) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s || "");
    if (!m) return null;
    let hex = m[1].toLowerCase();
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
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

  const getContrastColor = (bg) => {
    const parsed = parseAnyColor(bg);
    if (!parsed) return "#18181b";
    const { r, g, b } = blendOverWhite(parsed);
    const L = relLuminance({ r, g, b });
    const contrastWhite = (1.0 + 0.05) / (L + 0.05);
    const contrastBlack = (L + 0.05) / 0.05;
    return contrastWhite >= contrastBlack ? "white" : "#18181b";
  };

  const StatusDiamond = ({ type, label, tradeColor }) => {
    const mainColor = getColor(type, tradeColor);
    const outerDiamondColor = mainColor || "#3fbcf0";
    const innerDiamondColor = darkenColor(outerDiamondColor, 60);
    const pillBgColor = getLightColor(type, outerDiamondColor);
    const contrastColor = "white"; // Bauhelm-Icons im Kern sind weiß
    
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-full pr-3 py-0.5 pl-0.5 border border-transparent shadow-sm">
          <svg width="24" height="24" viewBox="-16 -16 32 32">
            {/* Outer Diamond (Border Effect) - Matching MilestoneElement */}
            <rect
              x="-14"
              y="-14"
              width="28"
              height="28"
              rx="6"
              fill={outerDiamondColor}
              transform="rotate(45)"
            />
            {/* Inner Diamond (Core) */}
            <rect
              x="-11"
              y="-11"
              width="22"
              height="22"
              rx="6"
              fill={innerDiamondColor}
              transform="rotate(45)"
            />
            
            {/* Status Icons */}
            {type === "completed" && (
              <g transform="scale(0.8)">
                <path
                  d="M -6 0 L -2 4 L 6 -4"
                  fill="none"
                  stroke={contrastColor}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}

            {type === "overdue" && (
              <text
                y="5"
                fill={contrastColor}
                fontSize="15"
                fontWeight="900"
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                style={{ pointerEvents: "none" }}
              >
                !
              </text>
            )}

            {type !== "completed" && type !== "overdue" && (
              <g transform="scale(0.95)" style={{ pointerEvents: "none" }}>
                <circle cx="0" cy="0" r="5" stroke={contrastColor} strokeWidth="2" fill="none" />
                <path d="M 0 0 L 0 -3 M 0 0 L 2.5 0" stroke={contrastColor} strokeWidth="2" strokeLinecap="round" />
              </g>
            )}
          </svg>
          <span className="font-semibold text-[11px] uppercase tracking-wider ml-1" style={{ color: type === "overdue" ? "#ef4444" : "#374151" }}>
            {label}
          </span>
        </div>
      </div>
    );
  };

  const MilestoneElement = ({ d, x, y, margin, showTooltip, hideTooltip, getColor, getLightColor, darkenColor }) => {
    const [isHovered, setIsHovered] = useState(false);
    const tradeColor = getColor(d.milestoneType, d.tradeColor);
    
    // Wir nehmen ein schönes Blau als Standard für Meilensteine, wenn keine tradeColor da ist
    // Im Screenshot ist es ein kräftiges Blau für die Raute und ein helleres für die Pille
    const outerDiamondColor = tradeColor || "#3fbcf0"; // Kräftiges Blau (Standard)
    const innerDiamondColor = darkenColor(outerDiamondColor, 30); // Etwas dunklere Farbe als Gewerkefarbe (statt Schwarz)
    
    // Hintergrund: Eine hellere Version der Gewerkefarbe (Vibrant Look mit Kontrast zum Diamanten)
    const pillBgColor = getLightColor(d.milestoneType, outerDiamondColor); 
    
    const labelText = d.process || "Meilenstein";
    // Breite für das Pillen-Label
    const labelWidth = labelText.length * 7 + 45;

    return (
      <g
        transform={`translate(${x}, ${y})`}
        onMouseEnter={() => {
          setIsHovered(true);
          showTooltip({
            tooltipLeft: margin.left + x,
            tooltipTop: margin.top + y - 10,
            tooltipData: d,
          });
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          hideTooltip();
        }}
        style={{ cursor: "pointer" }}
        pointerEvents="all"
        onClick={() => {
          window.open(
            `https://share.lcmdigital.com/?project=${d.projectId}&processid=${d.id}`,
            "_blank"
          );
        }}
      >
        {/* Transparent hit area to make hovering easier */}
        <circle r="20" fill="transparent" pointerEvents="all" />

        <motion.g
          initial={false}
          animate={{ 
            scale: isHovered ? 1.05 : 1,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          {/* Pill Container (Hintergrund-Rechteck) */}
          <rect
            x="0"
            y="-14"
            width={labelWidth}
            height="28"
            rx="6"
            fill={pillBgColor}
          />

          {/* Label Text */}
          <text
            x="28"
            y="5"
            fill="black"
            fontSize="14"
            fontWeight="500"
            style={{ pointerEvents: "none", fontFamily: "Inter, sans-serif" }}
          >
            {labelText}
          </text>

          {/* Diamond (Raute) - links überlagert */}
          <g transform="translate(0, 0)">
            {/* Outer Diamond (Border Effect) */}
            <rect
              x="-12"
              y="-12"
              width="24"
              height="24"
              rx="4"
              fill={outerDiamondColor}
              transform="rotate(45)"
            />
            {/* Inner Diamond (Core) */}
            <rect
              x="-10"
              y="-10"
              width="20"
              height="20"
              rx="4"
              fill={innerDiamondColor}
              transform="rotate(45)"
            />
            
            {/* Status Icons */}
            {d.milestoneType === "completed" && (
              <g transform="scale(0.7)">
                <path
                  d="M -6 0 L -2 4 L 6 -4"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}

            {d.milestoneType === "overdue" && (
              <text
                y="0"
                fill="white"
                fontSize="14"
                fontWeight="900"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="Inter, sans-serif"
                style={{ pointerEvents: "none" }}
              >
                !
              </text>
            )}

            {d.milestoneType !== "completed" && d.milestoneType !== "overdue" && (
              <g transform="scale(0.8)" style={{ pointerEvents: "none" }}>
                <circle cx="0" cy="0" r="5" stroke="white" strokeWidth="2" fill="none" />
                <path d="M 0 0 L 0 -3 M 0 0 L 2.5 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </g>
            )}
          </g>
        </motion.g>
      </g>
    );
  };

  const renderLcmMilestone = (d, x, y) => {
    // Vertikaler Versatz für überlagerte Meilensteine (untereinander darstellen)
    const offsetY = (d.indexInDate || 0) * 35; // Reduziert von 45px auf 35px passend zur kleineren Pille

    return (
      <MilestoneElement
        key={`${d.project}-${d.id}`}
        d={d}
        x={x}
        y={y + offsetY}
        margin={margin}
        showTooltip={showTooltip}
        hideTooltip={hideTooltip}
        getColor={getColor}
        getLightColor={getLightColor}
        darkenColor={darkenColor}
      />
    );
  };

  return (
    <div className="p-6 w-full space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-start">
            <div className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-100 p-1 text-zinc-500">
              <button
                onClick={() => setFilter("all")}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                  filter === "all"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "hover:bg-zinc-200 hover:text-zinc-950"
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => setFilter("overdue")}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                  filter === "overdue"
                    ? "bg-white text-red-600 shadow-sm"
                    : "text-red-500/70 hover:bg-zinc-200 hover:text-red-600"
                }`}
              >
                Überfällig
              </button>
              <button
                onClick={() => setFilter("next8weeks")}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                  filter === "next8weeks"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "hover:bg-zinc-200 hover:text-zinc-950"
                }`}
              >
                Nächste 8 Wochen
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full">
            <ParentSize>
              {({ width }) => (
                <MilestoneChart
                  data={milestoneData.list}
                  milestoneData={milestoneData}
                  projectOffsets={projectOffsets}
                  width={width}
                  height={projectOffsets.totalHeight + margin.top + margin.bottom}
                  margin={margin}
                  today={today}
                  filter={filter}
                  showTooltip={showTooltip}
                  hideTooltip={hideTooltip}
                  tooltipData={tooltipData}
                  tooltipLeft={tooltipLeft}
                  tooltipTop={tooltipTop}
                  getColor={getColor}
                  getLightColor={getLightColor}
                  renderLcmMilestone={renderLcmMilestone}
                />
              )}
            </ParentSize>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Detaillierte Liste</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-muted text-muted-foreground uppercase text-xs font-medium">
                <tr>
                  <th className="p-4">Projekt</th>
                  <th className="p-4">ID</th>
                  <th className="p-4">Vorgang</th>
                  <th className="p-4">Gewerk</th>
                  <th className="p-4 text-center">Datum</th>
                  <th className="p-4 text-center">Tage bis fällig</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {milestoneData.list.map((milestone) => (
                  <tr
                    key={`${milestone.project}-${milestone.id}`}
                    onClick={() => {
                      window.open(
                        `https://share.lcmdigital.com/?project=${milestone.projectId}&processid=${milestone.id}`,
                        "_blank"
                      );
                    }}
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-medium">{milestone.project}</td>
                    <td className="p-4">{milestone.id}</td>
                    <td className="p-4">{milestone.process}</td>
                    <td className="p-4">{milestone.trade}</td>
                    <td className="p-4 text-center">{milestone.date.toLocaleDateString()}</td>
                    <td className="p-4 text-center font-bold">
                      <span className={milestone.daysUntilDue < 0 ? "text-destructive" : "text-primary"}>
                        {milestone.daysUntilDue}
                      </span>
                    </td>
                    <td className="p-4 text-center flex justify-center items-center">
                      {milestone.milestoneType === "completed" ? (
                        <StatusDiamond type="completed" label="Abgeschlossen" tradeColor={milestone.tradeColor} />
                      ) : milestone.milestoneType === "overdue" ? (
                        <StatusDiamond type="overdue" label="Überfällig" tradeColor={milestone.tradeColor} />
                      ) : (
                        <StatusDiamond type="upcoming" label="Geplant" tradeColor={milestone.tradeColor} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Meilensteine;
