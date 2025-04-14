import React, { useState } from "react";
import { scaleTime, scaleBand } from "@visx/scale";
import { Bar, Line } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";

const excelDateToJSDate = (serial) => {
  if (!serial || isNaN(serial)) return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};

const GanttChart = ({ data, selectedProjects }) => {
  if (!data) return <p className="text-gray-400 text-lg">Keine Daten verfügbar...</p>;

  const today = new Date();

  let projectData = Object.keys(data)
    .map((projectName) => {
      if (selectedProjects.length > 0 && !selectedProjects.includes(projectName)) return null;

      const jsonData = data[projectName];

      const startDates = jsonData
        .map((row) => excelDateToJSDate(row["Start Date"]))
        .filter((date) => date instanceof Date && !isNaN(date));
      const endDates = jsonData
        .map((row) => excelDateToJSDate(row["End Date"]))
        .filter((date) => date instanceof Date && !isNaN(date));

      if (startDates.length === 0 || endDates.length === 0) return null;

      const projectStart = new Date(Math.min(...startDates));
      const projectEnd = new Date(Math.max(...endDates));
      const totalDuration = (projectEnd - projectStart) / (1000 * 60 * 60 * 24);
      const elapsedTime = (today - projectStart) / (1000 * 60 * 60 * 24);

      const pastProcesses = jsonData.filter((row) => excelDateToJSDate(row["End Date"]) < today);
      const completedPastProcesses = pastProcesses.filter((row) => row["Status"] === 1);

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
      };
    })
    .filter(Boolean);

  const width = 900;
  const height = 450;
  const margin = { top: 40, right: 20, bottom: 60, left: 200 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  const xScale = scaleTime({
    domain: [
      Math.min(...projectData.map((d) => d.start.getTime())),
      Math.max(...projectData.map((d) => d.end.getTime())),
    ],
    range: [0, xMax],
  });

  const yScale = scaleBand({
    domain: projectData.map((d) => d.project),
    range: [0, yMax],
    padding: 0.4,
  });

  const tooltipStyles = {
    ...defaultStyles,
    backgroundColor: "#1a1a1a",
    color: "#ffffff",
    fontSize: "14px",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #333",
  };

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  return (
    <div className="p-6 font-inter text-white w-full relative">
      <h2 className="text-3xl font-bold mb-6">Projekt-Zeitstrahl</h2>
      <div className="relative">
        <svg
          width={width}
          height={height}
          className="bg-[#111] rounded-lg"
          onMouseMove={(event) => {
            setMousePosition({ x: event.clientX, y: event.clientY });
          }}
        >
          <Group left={margin.left} top={margin.top}>
            <AxisBottom
              top={yMax}
              scale={xScale}
              stroke="#ccc"
              tickFormat={(d) => new Date(d).toLocaleDateString("de-DE")}
              tickLabelProps={() => ({ fill: "#ccc", fontSize: 12, textAnchor: "middle" })}
            />
            <AxisLeft
              scale={yScale}
              stroke="#ccc"
              tickLabelProps={() => ({ fill: "#ccc", fontSize: 14, textAnchor: "end" })}
            />
            {projectData.map((d) => {
              const x = xScale(d.start.getTime());
              const y = yScale(d.project);
              const width = xScale(d.end.getTime()) - x;
              const progressWidth = width * (d.progress / 100);

              return (
                <g
                  key={d.project}
                  onMouseEnter={(event) => {
                    showTooltip({
                      tooltipLeft: event.clientX + 10,
                      tooltipTop: event.clientY - 30,
                      tooltipData: d,
                    });
                  }}
                  onMouseMove={(event) => {
                    showTooltip({
                      tooltipLeft: event.clientX + 10,
                      tooltipTop: event.clientY - 30,
                      tooltipData: d,
                    });
                  }}
                  onMouseLeave={() => hideTooltip()}
                >
                  <Bar
                    x={x}
                    y={y}
                    width={width}
                    height={yScale.bandwidth()}
                    fill="#2f3e46"
                    rx={6}
                    opacity={0.7}
                  />
                  <Bar
                    x={x}
                    y={y}
                    width={progressWidth}
                    height={yScale.bandwidth()}
                    fill="#14b8a6"
                    rx={6}
                  />
                  <text
                    x={x + width / 2}
                    y={y + yScale.bandwidth() / 2 + 5}
                    fill="#ffffff"
                    fontSize={14}
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {Math.round(d.progress)}%
                  </text>
                </g>
              );
            })}
            <Line
              from={{ x: xScale(today.getTime()), y: 0 }}
              to={{ x: xScale(today.getTime()), y: yMax }}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          </Group>
        </svg>
        {tooltipData && (
          <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
            <div className="text-sm">
              <strong>{tooltipData.project}</strong>
              <br />📅 Start: {tooltipData.start.toLocaleDateString("de-DE")}
              <br />🏁 Ende: {tooltipData.end.toLocaleDateString("de-DE")}
              <br />📊 Fortschritt: {Math.round(tooltipData.progress)}% ({
                tooltipData.completedProcesses
              }/{tooltipData.totalProcesses})
            </div>
          </TooltipWithBounds>
        )}
      </div>
    </div>
  );
};

export default GanttChart;
