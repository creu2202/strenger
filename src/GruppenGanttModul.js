// GruppenGanttModul.js
import React, { useMemo, useState, useEffect } from "react";
import { scaleTime, scaleBand } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { Bar, Line } from "@visx/shape";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { tooltipStyles, tooltipHeaderStyle } from "./tooltipStyles";
import { timeFormat } from "d3-time-format";
import Select from "react-select";
import * as d3 from "d3-time";
const getWeekNumber = (date) => parseInt(timeFormat("%V")(date), 10);


const excelDateToJSDate = (serial) => {
  if (!serial || isNaN(serial)) return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};

const projektFarben = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
  "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
  "#bcbd22", "#17becf",
];

const getProjektFarbe = (projektName, alleNamen) => {
  const index = alleNamen.indexOf(projektName);
  return projektFarben[index % projektFarben.length];
};


const GruppenGanttModul = ({ data, gewerkFilter, selectedProjects }) => {
  const gruppen = useMemo(() => {
    const saved = localStorage.getItem("prozessGruppen");
    return saved ? JSON.parse(saved) : [];
  }, []);
  const aktiveProjekte = useMemo(() => selectedProjects?.length ? selectedProjects : Object.keys(data), [selectedProjects, data]);

  
  const [viewRangeDays, setViewRangeDays] = useState(28); // default: 4 Wochen
  const [sortMode, setSortMode] = useState("projekt"); // "projekt" oder "datum"
  const [wochenOffset, setWochenOffset] = useState(0);
  const [zuordnungen, setZuordnungen] = useState({});
  const [auswahlIndex, setAuswahlIndex] = useState(null);
  const [modalZuordnungOffen, setModalZuordnungOffen] = useState(false);
  const [aktuellerBalken, setAktuellerBalken] = useState(null);



  useEffect(() => {
    const handleClickOutside = (e) => {
      const isBar = e.target.nodeName === "rect";
      const isForeignObject = e.target.closest("foreignObject");
      if (!isBar && !isForeignObject) {
        setAuswahlIndex(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);
  
  
  

  const gruppenBalken = useMemo(() => {
    const balkenMap = new Map();
  
    Object.entries(data).forEach(([projektName, prozesse]) => {
      if (!aktiveProjekte.includes(projektName)) return;
  
      prozesse.forEach((p) => {
        const isAktiv = !gewerkFilter?.length || (p.Trade && gewerkFilter.includes(p.Trade.trim()));
        if (!isAktiv) return;


  
        // TaktZone bestimmen (letzter Level)
        const taktZoneKeys = Object.keys(p).filter((key) => key.startsWith("TaktZone Level"));
        const maxLevel = Math.max(
          ...taktZoneKeys.map((key) => parseInt(key.split(" ")[2])).filter((n) => !isNaN(n))
        );
        const taktZone = p[`TaktZone Level ${maxLevel}`] || "Kein Bereich";
  
        const mapKey = `${projektName}___${taktZone}`;
  
        if (!balkenMap.has(mapKey)) {
          balkenMap.set(mapKey, {
            projekt: projektName,
            taktZone,
            prozesse: [],
            farbe: getProjektFarbe(projektName, Object.keys(data)),
          });
        }
  
        balkenMap.get(mapKey).prozesse.push(p);
      });
    });
  
    return Array.from(balkenMap.values())
      .map((b) => {
        const startDates = b.prozesse.map((p) => excelDateToJSDate(p["Start Date"])).filter(Boolean);
        const endDates = b.prozesse.map((p) => excelDateToJSDate(p["End Date"])).filter(Boolean);
        if (startDates.length === 0 || endDates.length === 0) return null;
  
        const startDate = new Date(Math.min(...startDates.map((d) => d.getTime())));
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(Math.max(...endDates.map((d) => d.getTime())));
        endDate.setHours(23, 59, 59, 999);
        
        return {
          ...b,
          start: startDate,
          end: endDate,
        };
        
      })
      .filter(Boolean);
    }, [data, aktiveProjekte, gewerkFilter]);
  

  const width = window.innerWidth - 100;


  const margin = { top: 60, right: 40, bottom: 60, left: 300 };
  const xMax = width - margin.left - margin.right;
  

  const startOfView = useMemo(() => {
    const now = new Date();
    const monday = new Date(now.setDate(now.getDate() - now.getDay() + 1 + wochenOffset * 7));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [wochenOffset]);

  const endOfView = new Date(startOfView);
  endOfView.setDate(endOfView.getDate() + viewRangeDays - 1);
  

  const xScale = scaleTime({
    domain: [startOfView, endOfView],
    range: [0, xMax],
  });
  const tickValues = useMemo(() => {
    const result = [];
    const current = new Date(startOfView);
  
    if (viewRangeDays <= 13) {
      // Einzeltage anzeigen
      while (current <= endOfView) {
        result.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    } else if (viewRangeDays <= 49) {
      // Nur Montage (KW)
      current.setDate(current.getDate() - current.getDay() + 1); // Montag
      while (current <= endOfView) {
        result.push(new Date(current));
        current.setDate(current.getDate() + 7);
      }
    } else {
      // Nur Monatsanfänge
      current.setDate(1);
      while (current <= endOfView) {
        result.push(new Date(current));
        current.setMonth(current.getMonth() + 1);
      }
    }
  
    return result;
  }, [startOfView, endOfView, viewRangeDays]);
  
  
  const sichtbareBalken = useMemo(() => {
    const gefiltert = gruppenBalken.filter(
      (b) =>
        aktiveProjekte.includes(b.projekt) &&
        b.end >= startOfView &&
        b.start <= endOfView
    );
  
    if (sortMode === "datum") {
      return gefiltert
        .sort((a, b) => {
          const startDiff = a.start - b.start;
          if (startDiff !== 0) return startDiff;
          return a.end - b.end;
        })
        .reverse(); // damit spätestes Startdatum ganz oben ist
    } else {
      // sortiert nach Projektname, dann innerhalb Projekt nach Datum absteigend
      const gruppiert = gefiltert.reduce((acc, b) => {
        if (!acc[b.projekt]) acc[b.projekt] = [];
        acc[b.projekt].push(b);
        return acc;
      }, {});
  
      const projektReihenfolge = Object.keys(data).filter((p) =>
        aktiveProjekte.includes(p)
      );
  
      const sortiert = projektReihenfolge.flatMap((projekt) => {
        return (gruppiert[projekt] || []).sort((a, b) => {
          const startDiff = b.start - a.start;
          if (startDiff !== 0) return startDiff;
          return b.end - a.end;
        });
      });
  
      return sortiert;
    }
  }, [gruppenBalken, aktiveProjekte, startOfView, endOfView, sortMode, data]);
  
  const minBarHeight = 24;
const chartPadding = 60 + 60 + 60; // top + bottom + etwas extra
const height = sichtbareBalken.length * minBarHeight + chartPadding;
const yMax = height - margin.top - margin.bottom;
  

  const yScale = scaleBand({
    domain: sichtbareBalken.map((b) => `${b.projekt} - ${b.taktZone}`).reverse(),
    range: [0, yMax],
    padding: 0.3,
  });
  
  

  const { showTooltip, hideTooltip, tooltipData, tooltipTop, tooltipLeft } = useTooltip();

  const weekFormat = timeFormat("KW %V %d.%m.%Y");
  const weekLines = useMemo(() => {
    const lines = [];
    const base = new Date(startOfView);
    base.setDate(base.getDate() - base.getDay() + 1); // Montag der Woche
  
    while (base <= endOfView) {
      lines.push(new Date(base));
      base.setDate(base.getDate() + 7);
    }
  
    return lines;
  }, [startOfView, endOfView]);
  
  

  const today = new Date();

  const overlappingCounts = weekLines.map((weekStart) => {
    const currentKW = getWeekNumber(weekStart);
    const year = weekStart.getFullYear();
  
    const count = sichtbareBalken.reduce((acc, b) => {
      const startKW = getWeekNumber(b.start);
      const endKW = getWeekNumber(b.end);
      const startYear = b.start.getFullYear();
      const endYear = b.end.getFullYear();
  
      const inSameYear = startYear === year && endYear === year;
      const acrossYears = startYear !== endYear;
  
      const startsInKW = startKW === currentKW && startYear === year;
      const endsInKW = endKW === currentKW && endYear === year;
  
      const inBetween = (
        (startYear < year || (startYear === year && startKW < currentKW)) &&
        (endYear > year || (endYear === year && endKW > currentKW))
      );
  
      const overlaps = startsInKW || endsInKW || inBetween;
  
      return overlaps ? acc + 1 : acc;
    }, 0);
  
    return { weekStart: new Date(weekStart), count };
  });
  
  
  
  
  
  
  


  const handleBarClick = (balken) => {

  };

  const handleZuordnen = (taktZone, person) => {
    setZuordnungen((prev) => ({ ...prev, [taktZone]: person }));
    setModalZuordnungOffen(false);
  };
  
  const handleUnassign = (taktZone) => {
    setZuordnungen((prev) => {
      const copy = { ...prev };
      delete copy[taktZone];
      return copy;
    });
    setModalZuordnungOffen(false);
  };
  





  return (
    <div className="p-6 text-white font-inter relative">

  
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">📊 Ressourcenauslastung</h2>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setSortMode((prev) => (prev === "projekt" ? "datum" : "projekt"))
            }
            className="bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded"
          >
            🔀 Sortierung: {sortMode === "projekt" ? "nach Projekt" : "nach Datum"}
          </button>
          <button onClick={() => setWochenOffset(0)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded">🔄 Heute</button>
          <button onClick={() => setWochenOffset((prev) => prev - 1)} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded">◀️ Woche zurück</button>
          <button onClick={() => setWochenOffset((prev) => prev + 1)} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded">Woche vor ▶️</button>
        </div>


      </div>
      <div className="flex flex-col gap-2 mt-4">
          <label className="text-white text-sm">
            📅 Vorschau: {Math.round(viewRangeDays / 7)} Woche(n) ({viewRangeDays} Tage)
          </label>
          <input
            type="range"
            min={7}
            max={180}
            step={7}
            value={viewRangeDays}
            onChange={(e) => setViewRangeDays(Number(e.target.value))}
            className="w-64 accent-blue-500"
          />
        </div>
        <div id="gantt-container">
        <svg width={width} height={height} className="bg-[#111] rounded-lg">
        <Group left={margin.left} top={margin.top}>
          
        {
  (() => {
    const projektGruppen = [...new Set(sichtbareBalken.map(b => b.projekt))];

    return projektGruppen.map((projekt, i) => {
      const projektBalken = sichtbareBalken.filter(b => b.projekt === projekt);
      if (projektBalken.length === 0) return null;

      const firstY = yScale(`${projekt} - ${projektBalken[0].taktZone}`);
      const lastY = yScale(`${projekt} - ${projektBalken[projektBalken.length - 1].taktZone}`);
      if (firstY === undefined || lastY === undefined) return null;

      const y1 = firstY;
      const y2 = lastY + yScale.bandwidth();
      const yCenter = y1 + (y2 - y1) / 2;

      return (
        <text
          key={projekt}
          x={-10}
          y={yCenter}
          fill="#fff"
          fontSize={14}
          fontWeight="bold"
          textAnchor="end"
          alignmentBaseline="middle"
        >
          {projekt}
        </text>
      );
    });
  })()
}



          {weekLines.map((d, i) => (
            <Line
              key={i}
              from={{ x: xScale(d), y: 0 }}
              to={{ x: xScale(d), y: yMax }}
              stroke="#444"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
          ))}
  
          {today >= startOfView && today <= endOfView && (
            <Line
              from={{ x: xScale(today), y: 0 }}
              to={{ x: xScale(today), y: yMax }}
              stroke="#FF4136"
              strokeWidth={2}
              strokeDasharray="6 2"
            />
          )}
  
          {overlappingCounts.map(({ weekStart, count }, i) =>
            count > 4 ? (
              <text
                key={`warn-${i}`}
                x={xScale(weekStart)}
                y={-10}
                fill="red"
                fontSize={12}
                textAnchor="middle"
              >
                🔴 {count}
              </text>
            ) : null
          )}


<AxisBottom
  top={yMax}
  scale={xScale}
  stroke="#ccc"
  tickValues={tickValues}
  tickFormat={(date) => {
    if (viewRangeDays <= 13) {
      return timeFormat("%a %d.%m")(date); // z.B. "Mo 17.06"
    } else if (viewRangeDays <= 49) {
      const weekNumber = timeFormat("%V")(date);
      const monday = timeFormat("%d.%m")(date);
      return `KW ${weekNumber} – ${monday}`;
    } else {
      return timeFormat("%B %Y")(date); // z.B. "Juli 2025"
    }
  }}
  
  
  tickLabelProps={() => ({ fill: "#ccc", fontSize: 12, textAnchor: "middle" })}
/>


  

  
          {sichtbareBalken.map((balken, index) => {
            const x0 = Math.max(xScale(balken.start), 0);
            const x1 = Math.min(xScale(balken.end), xMax);
            const y = yScale(`${balken.projekt} - ${balken.taktZone}`);
            const barWidth = x1 - x0;
            
            const zugeordnet = zuordnungen[balken.taktZone];
            const barColor = zugeordnet?.farbe || balken.farbe;
  
            return (
              <g key={index}>
                <Bar
                  x={x0}
                  y={y}
                  width={barWidth}
                  height={yScale.bandwidth()}
                  fill={barColor}
                  rx={4}
                  onClick={() => handleBarClick(balken)}
                  onMouseEnter={(e) => {
                    const point = localPoint(e);
                    showTooltip({
                      tooltipLeft: point.x,
                      tooltipTop: point.y - 20,
                      tooltipData: balken,
                    });
                  }}
                  onMouseMove={(e) => {
                    const point = localPoint(e);
                    showTooltip({
                      tooltipLeft: point.x,
                      tooltipTop: point.y - 20,
                      tooltipData: balken,
                    });
                  }}
                  
                  onMouseLeave={hideTooltip}
                />
                <text
                  x={x0 + 5}
                  y={y + yScale.bandwidth() / 2 + 4}
                  fontSize={12}
                  fill="#000"
                  pointerEvents="all"
                  onMouseEnter={(e) => {
                    const point = localPoint(e);
                    showTooltip({
                      tooltipLeft: point.x,
                      tooltipTop: point.y - 20,
                      tooltipData: balken,
                    });
                  }}
                  onMouseMove={(e) => {
                    const point = localPoint(e);
                    showTooltip({
                      tooltipLeft: point.x,
                      tooltipTop: point.y - 20,
                      tooltipData: balken,
                    });
                  }}
                  onMouseLeave={hideTooltip}
                >
                  {balken.taktZone}{zugeordnet ? ` 👤 ${zugeordnet.name}` : ""}
                </text>

              </g>
            );
          })}
        </Group>
      </svg>
      </div>


      <div className="mt-6 flex flex-wrap gap-3">
  <h3 className="text-white text-sm font-semibold w-full">🎨 Projektfarben:</h3>
  {Object.keys(data).map((projektName) => (
    <div key={projektName} className="flex items-center gap-2 text-sm">
      <div className="w-4 h-4 rounded" style={{ backgroundColor: getProjektFarbe(projektName, Object.keys(data)) }} />
      <span className="text-white">{projektName}</span>
    </div>
  ))}
</div>



      {tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
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
          <div className="text-sm flex flex-col gap-1.5 min-w-[200px]">
            <strong className="text-slate-900 border-b border-slate-100 pb-1.5 mb-0.5 block font-bold leading-tight" style={tooltipHeaderStyle}>
              {tooltipData.taktZone}
            </strong>
            <div className="space-y-1.5 mt-0.5">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-base shrink-0">📍</span> 
                <span className="text-xs font-medium">Bereich: {tooltipData.taktZone}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-base shrink-0">📅</span> 
                <span className="text-xs font-semibold text-slate-900">
                  {tooltipData.start.toLocaleDateString("de-DE")} – {tooltipData.end.toLocaleDateString("de-DE")}
                </span>
              </div>
              
              <div className="mt-2 pt-1.5 border-t border-slate-50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base shrink-0">🧩</span> 
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Prozesse:</span>
                </div>
                <ul className="space-y-1 ml-1">
                  {tooltipData.prozesse.slice(0, 5).map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600 leading-tight">
                      <span className="mt-1 w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                      <span>{p.Process} <span className="text-slate-400">({p.Trade})</span></span>
                    </li>
                  ))}
                  {tooltipData.prozesse.length > 5 && (
                    <li className="text-[10px] text-slate-400 italic ml-2.5">
                      ...und {tooltipData.prozesse.length - 5} weitere
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </TooltipWithBounds>
      )}
  
  {modalZuordnungOffen && aktuellerBalken && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
          <div className="bg-[#1f1f1f] p-6 rounded-xl shadow-2xl w-[320px] max-w-full animate-fadeIn text-white">
            <h3 className="text-xl font-bold mb-3 text-center">👤 Mitarbeiter zuweisen</h3>
            <div className="text-sm text-gray-300 mb-4 text-center">
              Bereich: <strong>{aktuellerBalken.taktZone}</strong><br />
              Gruppe: <strong>{aktuellerBalken.gruppe}</strong>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {mitarbeiter.map((m, i) => (
                <button
                  key={i}
                  onClick={() => handleZuordnen(aktuellerBalken.taktZone, m)}
                  className="flex items-center w-full bg-[#2a2a2a] hover:bg-[#333] text-left px-3 py-2 rounded-md transition-all"
                >
                  <div
                    className="w-4 h-4 rounded-full mr-3"
                    style={{ backgroundColor: m.farbe }}
                  ></div>
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
            {zuordnungen[aktuellerBalken.taktZone] && (
              <button
                onClick={() => handleUnassign(aktuellerBalken.taktZone)}
                className="mt-3 w-full bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-2 rounded-md font-semibold"
              >
                🔄 Zuweisung entfernen
              </button>
            )}
            <button
              onClick={() => setModalZuordnungOffen(false)}
              className="mt-5 w-full bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-md font-semibold"
            >
              ✖️ Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
  
};

export default GruppenGanttModul;