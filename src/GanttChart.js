import React, { useState, useMemo } from "react";
import { scaleTime, scaleBand } from "@visx/scale";
import { Bar, Line } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import ParentSize from "@visx/responsive/lib/components/ParentSize";
import { tooltipStyles, tooltipHeaderStyle } from "./tooltipStyles";
import {
  Card,
  CardContent,
} from "./components/ui/card";

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

const RESPONSIBLE_KEYS = [
  "Responsibles", "Responsible", "Verantwortlich", "Verantwortliche", "Verantwortliche(r)"
];
const parseResponsibles = (val) => {
  if (val == null && val !== 0) return [];
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
  const s = String(val);
  return s.split(/[\n,;\/|]+/g).map(t => t.trim()).filter(Boolean);
};

const ChartContent = ({ data, selectedProjects, width, height, searchTerm, gewerkFilter, bereichFilter, responsiblesFilter }) => {
  const today = new Date();
  const normalizedSearch = searchTerm?.toLowerCase().trim();

  const projectData = Object.keys(data)
    .map((projectName) => {
      if (selectedProjects.length > 0 && !selectedProjects.includes(projectName)) return null;

      const jsonData = data[projectName];

      // Alle Prozesse sammeln
      const processes = jsonData.map((row) => {
        const name = (row["Process"] || row["Task"] || "Unbekannt").toString();
        const trade = (row["Trade"] || "").toString();
        const id = (row["ID"] || "").toString();

        // --- FILTERS ---
        if (gewerkFilter && gewerkFilter.length > 0 && !gewerkFilter.includes(trade)) {
          return null;
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
          if (!hasAreaMatch) return null;
        }

        if (responsiblesFilter && responsiblesFilter.length > 0) {
          const rowResponsibles = parseResponsibles(row.Responsibles ?? row.Responsible ?? row.Verantwortlich ?? row["Verantwortliche(r)"]);
          const hasRespMatch = rowResponsibles.some(r => responsiblesFilter.includes(r));
          if (!hasRespMatch) return null;
        }
        // ---------------

        const start = parseDate(row["Start Date"]);
        const end = parseDate(row["End Date"]);
        const status = row["Status"];

        if (normalizedSearch) {
          const hit = 
            projectName.toLowerCase().includes(normalizedSearch) ||
            name.toLowerCase().includes(normalizedSearch) ||
            trade.toLowerCase().includes(normalizedSearch) ||
            id.toLowerCase().includes(normalizedSearch);
          
          if (!hit) return null;
        }
        
        return {
          name,
          start,
          end,
          status,
        };
      }).filter(p => p && p.start && p.end);

      const startDates = processes.map(p => p.start);
      const endDates = processes.map(p => p.end);

      if (startDates.length === 0 || endDates.length === 0) return null;

      const projectStart = new Date(Math.min(...startDates));
      const projectEnd = new Date(Math.max(...endDates));
      const totalDuration = (projectEnd - projectStart) / (1000 * 60 * 60 * 24);
      const elapsedTime = (today - projectStart) / (1000 * 60 * 60 * 24);

      const pastProcesses = processes.filter((p) => p.end < today);
      const completedPastProcesses = pastProcesses.filter((p) => p.status === 1);

      const completionFactor =
        pastProcesses.length > 0 ? completedPastProcesses.length / pastProcesses.length : 0;
      const progress = totalDuration > 0 ? (elapsedTime / totalDuration) * completionFactor * 100 : 0;

      return {
        project: projectName,
        start: projectStart,
        end: projectEnd,
        progress,
        totalProcesses: pastProcesses.length,
        completedProcesses: completedPastProcesses.length,
        processes, // Alle Prozesse für das Rendering
      };
    })
    .filter(Boolean);

  if (projectData.length === 0) return <p className="text-muted-foreground text-lg p-6">Keine passenden Projektdaten gefunden.</p>;

  const margin = { top: 25, right: 20, bottom: 40, left: 140 };
  const xMax = Math.max(0, width - margin.left - margin.right);
  
  // Feste Balkenhöhe und Abstand wie in Fortschritt.js
  const barHeight = 60;
  const gap = 30;
  const chartHeight = projectData.length * (barHeight + gap);
  const yMax = Math.max(chartHeight, 200);

  const startDate = new Date(Math.min(...projectData.map((d) => d.start.getTime())));
  const endDate = new Date(Math.max(...projectData.map((d) => d.end.getTime())));
  
  // Puffer hinzufügen (z.B. 10% der Gesamtdauer)
  const duration = endDate.getTime() - startDate.getTime();
  const buffer = duration * 0.05;

  const xScale = scaleTime({
    domain: [
      startDate.getTime() - buffer,
      endDate.getTime() + buffer,
    ],
    range: [0, xMax],
  });

  const yScale = scaleBand({
    domain: projectData.map((d) => d.project),
    range: [0, yMax],
    padding: 30 / (60 + 30), // padding ratio relative to step
  });

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip();

  return (
    <div className="relative group/chart overflow-x-auto overflow-y-hidden pb-4">
      <svg width={width} height={yMax + margin.top + margin.bottom} className="overflow-visible">
        <Group left={margin.left} top={margin.top}>
          <AxisBottom
            top={yMax}
            scale={xScale}
            stroke="hsl(var(--muted-foreground))"
            tickFormat={(d) => new Date(d).toLocaleDateString("de-DE", { day: '2-digit', month: '2-digit' })}
            numTicks={width > 800 ? 10 : 5}
            tickLabelProps={() => ({ 
              fill: "hsl(var(--muted-foreground))", 
              fontSize: 12, 
              textAnchor: "middle",
              fontFamily: "Inter, sans-serif"
            })}
          />
          <AxisLeft
            scale={yScale}
            stroke="hsl(var(--muted-foreground))"
            tickLabelProps={() => ({ 
              fill: "hsl(var(--muted-foreground))", 
              fontSize: 13, 
              textAnchor: "end", 
              dx: "-0.5em", 
              dy: "0.33em",
              fontFamily: "Inter, sans-serif",
              fontWeight: 500
            })}
            tickFormat={(d) => d.length > 25 ? d.substring(0, 22) + "..." : d}
          />
          {projectData.map((d) => {
            const x = xScale(d.start.getTime());
            const y = yScale(d.project);
            const barWidth = xScale(d.end.getTime()) - x;
            const progressWidth = Math.max(0, Math.min(barWidth, barWidth * (d.progress / 100)));
            const radius = 6;

            return (
              <g
                key={d.project}
                className="group/row transition-all duration-200"
                onMouseEnter={(event) => {
                  const point = localPoint(event);
                  showTooltip({
                    tooltipLeft: point.x,
                    tooltipTop: point.y - 20,
                    tooltipData: d,
                  });
                }}
                onMouseMove={(event) => {
                  const point = localPoint(event);
                  showTooltip({
                    tooltipLeft: point.x,
                    tooltipTop: point.y - 20,
                    tooltipData: d,
                  });
                }}
                onMouseLeave={() => hideTooltip()}
              >
                {/* Hintergrund-Balken */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={yScale.bandwidth()}
                  fill="hsl(var(--muted))"
                  rx={radius}
                  className="opacity-20"
                />
                {/* Fortschritts-Balken */}
                <rect
                  x={x}
                  y={y}
                  width={progressWidth}
                  height={yScale.bandwidth()}
                  fill="#10b981"
                  rx={radius}
                  className="transition-all duration-300 hover:brightness-110"
                />
                {d.progress > 5 && (
                  <text
                    x={x + progressWidth / 2}
                    y={y + yScale.bandwidth() / 2}
                    dy=".35em"
                    fill="white"
                    fontSize={12}
                    textAnchor="middle"
                    fontWeight="500"
                    className="pointer-events-none drop-shadow-sm font-inter"
                  >
                    {Math.round(d.progress)}%
                  </text>
                )}
              </g>
            );
          })}
          <Line
            from={{ x: xScale(today.getTime()), y: 0 }}
            to={{ x: xScale(today.getTime()), y: yMax }}
            stroke="#6b7280"
            strokeWidth={2}
            strokeDasharray="4 4"
            className="drop-shadow-sm"
          />
          <text
            x={xScale(today.getTime())}
            y={-10}
            fill="hsl(var(--muted-foreground))"
            fontSize={13}
            textAnchor="middle"
            fontWeight="500"
            fontFamily="Inter, sans-serif"
          >
            Heute ({today.toLocaleDateString("de-DE", { day: '2-digit', month: '2-digit' })})
          </text>
        </Group>
      </svg>
      {tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={{
          ...tooltipStyles,
          backgroundColor: "#ffffff",
          color: "#0f172a",
          boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
          border: "1px solid #e2e8f0",
          borderRadius: "0.5rem",
          padding: "0.75rem",
          zIndex: 100,
        }}>
          <div className="flex flex-col gap-1.5">
            <div className="font-bold border-b border-slate-100 pb-1.5 mb-1 text-slate-900">
              {tooltipData.project}
            </div>
            <div className="grid grid-cols-[1.25rem_1fr] items-center gap-y-1.5 text-xs">
              <span className="text-sm">📅</span>
              <span className="text-slate-600">
                <span className="opacity-70">Start:</span>{" "}
                <span className="font-semibold text-slate-900">{tooltipData.start.toLocaleDateString("de-DE")}</span>
              </span>
              <span className="text-sm">🏁</span>
              <span className="text-slate-600">
                <span className="opacity-70">Ende:</span>{" "}
                <span className="font-semibold text-slate-900">{tooltipData.end.toLocaleDateString("de-DE")}</span>
              </span>
              <span className="text-sm">📊</span>
              <span className="text-slate-600">
                <span className="opacity-70">Fortschritt:</span>{" "}
                <span className="font-bold text-emerald-600">{Math.round(tooltipData.progress)}%</span>
              </span>
              <span className="col-start-2 text-[10px] text-slate-400 italic">
                ({tooltipData.completedProcesses} von {tooltipData.totalProcesses} Prozessen)
              </span>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
};

const GanttChart = ({ data, selectedProjects, searchTerm, gewerkFilter, bereichFilter, responsiblesFilter }) => {
  if (!data) return <p className="text-gray-500 text-lg">Keine Daten verfügbar...</p>;

  return (
    <div className="p-4 font-inter text-gray-900 w-full min-h-[40vh]">
      <Card className="w-full h-full overflow-visible border border-border shadow-sm bg-card">
        <CardContent className="w-full h-full p-0">
          <ParentSize>
            {({ width, height }) => (
              <ChartContent
                data={data}
                selectedProjects={selectedProjects}
                width={width}
                height={height}
                searchTerm={searchTerm}
                gewerkFilter={gewerkFilter}
                bereichFilter={bereichFilter}
                responsiblesFilter={responsiblesFilter}
              />
            )}
          </ParentSize>
        </CardContent>
      </Card>
    </div>
  );
};

export default GanttChart;
