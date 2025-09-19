import React, { useMemo, useState } from "react";
import { FaFlagCheckered, FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";
import { motion } from "framer-motion";
import { scaleTime, scaleBand } from "@visx/scale";
import { Group } from "@visx/group";
import { Line } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";

const DURATION_KEYS = ["Duration", "Dauer", "Dauer [d]", "Duration (d)"];

const excelDateToJSDate = (serial) => {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};

const Meilensteine = ({ data, projects, selectedProjects, gewerkFilter }) => {
  if (!data) return <p className="text-gray-400 text-lg">Keine Daten verfügbar...</p>;

  const today = new Date();
  const [filter, setFilter] = useState("all");
  const tooltipStyles = {
    ...defaultStyles,
    backgroundColor: "#222",
    color: "#fff",
    fontSize: "14px",
    padding: "8px 12px",
    borderRadius: "6px",
  };
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip();

  const milestoneData = useMemo(() => {
    const list = [];
    Object.keys(data).forEach((projectName) => {
      if (selectedProjects.length > 0 && !selectedProjects.includes(projectName)) return;

      const projectMeta = projects.find((p) => p.name === projectName);
      if (!projectMeta) return;

      const jsonData = data[projectName];
      jsonData.forEach((row) => {
        const startDate = excelDateToJSDate(row["Start Date"]);
        const endDate = excelDateToJSDate(row["End Date"]);
        const progress = row["Status"] * 100;
        const daysUntilDue = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));

        // Dauer aus API-Feld ermitteln (oder inklusiv aus Start/Ende berechnen)
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
            durationDays = Math.max(0, diff + 1); // inkl. beide Tage
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
          
          if (gewerkFilter.length > 0 && !gewerkFilter.includes(row["Trade"])) return;

          const item = {
            projectId: projectMeta.projectId,
            project: projectName,
            id: row["ID"],
            process: row["Process"],
            trade: row["Trade"],
            date: startDate,
            daysUntilDue,
            milestoneType,
          };

          if (filter === "overdue" && milestoneType !== "overdue") return;
          if (filter === "next8weeks" && !(daysUntilDue >= 0 && daysUntilDue <= 56)) return;

          list.push(item);
        }
      });
    });
    return list;
  }, [data, projects, selectedProjects, filter, gewerkFilter]);

  const width = 900;
  const height = 250;
  const margin = { top: 40, right: 20, bottom: 60, left: 150 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  const xScale = scaleTime({
    domain: [
      Math.min(...milestoneData.map((d) => d.date.getTime())),
      Math.max(...milestoneData.map((d) => d.date.getTime())),
    ],
    range: [0, xMax],
  });

  const yScale = scaleBand({
    domain: [...new Set(milestoneData.map((d) => d.project))],
    range: [0, yMax],
    padding: 0.4,
  });

  const getColor = (type) => {
    if (type === "completed") return "#0dd4c4";
    if (type === "overdue") return "#ce5c63";
    return "#e1aa6a";
  };

  return (
    <div className="p-6 font-inter text-white w-full">
      <div className="flex gap-4 mb-6">
        <label className="flex items-center gap-2">
          <input type="radio" name="filter" checked={filter === "all"} onChange={() => setFilter("all")} /> Alle
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="filter" checked={filter === "overdue"} onChange={() => setFilter("overdue")} /> Überfällig
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="filter" checked={filter === "next8weeks"} onChange={() => setFilter("next8weeks")} /> Nächste 8 Wochen
        </label>
      </div>

      <h2 className="text-3xl font-bold mb-6">Meilensteine Übersicht</h2>
      <div className="relative">
        <svg width={width} height={height} className="bg-[#111] rounded-lg">
          <Group left={margin.left} top={margin.top}>
            <AxisBottom
              top={yMax}
              scale={xScale}
              stroke="#999"
              tickFormat={(d) => new Date(d).toLocaleDateString("de-DE")}
              tickLabelProps={() => ({ fill: "#aaa", fontSize: 12, textAnchor: "middle" })}
            />
            <AxisLeft
              scale={yScale}
              stroke="#999"
              tickLabelProps={() => ({ fill: "#eee", fontSize: 14, textAnchor: "end" })}
            />
            {milestoneData.map((d) => {
              const x = xScale(d.date.getTime());
              const y = yScale(d.project) + yScale.bandwidth() / 2;
              return (
                <g
                  key={`${d.project}-${d.id}`}
                  transform={`translate(${x}, ${y})`}
                  onMouseEnter={() =>
                      showTooltip({
                        tooltipLeft: margin.left + x,
                        tooltipTop: margin.top + y - 10,
                        tooltipData: d,
                      })
                    }
                    onMouseMove={() =>
                      showTooltip({
                        tooltipLeft: margin.left + x,
                        tooltipTop: margin.top + y - 10,
                        tooltipData: d,
                      })
                    }

                  onMouseLeave={hideTooltip}
                >
                  <polygon
                    points="-5,0 0,-8 5,0 0,8"
                    fill={getColor(d.milestoneType)}
                    stroke="#fff"
                    strokeWidth="1"
                  />
                </g>
              );
            })}
            <Line
              from={{ x: xScale(today.getTime()), y: 0 }}
              to={{ x: xScale(today.getTime()), y: yMax }}
              stroke="#ce5c63"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          </Group>
        </svg>
        {tooltipData && (
          <TooltipWithBounds
            left={tooltipLeft}
            top={tooltipTop}
            style={tooltipStyles}
          >
            <div className="text-sm">
              <strong>{tooltipData.project}</strong>
              <br />📌 {tooltipData.process}
              <br />🧰 {tooltipData.trade}
              <br />📅 {tooltipData.date.toLocaleDateString("de-DE")}
              <br />⏳ {tooltipData.daysUntilDue} Tage
            </div>
          </TooltipWithBounds>
        )}
      </div>

      <motion.table
        className="w-full text-white border-collapse shadow-lg rounded-lg overflow-hidden text-left mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <thead className="bg-[#222]">
          <tr>
            <th className="p-4">Projekt</th>
            <th className="p-4">ID</th>
            <th className="p-4">Vorgang</th>
            <th className="p-4">Gewerk</th>
            <th className="p-4">Datum</th>
            <th className="p-4">Tage bis fällig</th>
            <th className="p-4">Status</th>
          </tr>
        </thead>
        <tbody className="bg-[#1a1a1a] divide-y divide-[#333]">
          {milestoneData.map((milestone) => (
            <motion.tr
              onTap={() => {
                window.open(
                  `https://share.lcmdigital.com/?project=${milestone.projectId}&processid=${milestone.id}`,
                  "_blank"
                );
              }}
              key={`${milestone.project}-${milestone.id}`}
              className="hover:bg-[#2e2e2e] transition duration-300 cursor-pointer"
              whileHover={{ scale: 1.02 }}
            >
              <td className="p-4 font-semibold">{milestone.project}</td>
              <td className="p-4">{milestone.id}</td>
              <td className="p-4">{milestone.process}</td>
              <td className="p-4">{milestone.trade}</td>
              <td className="p-4">{milestone.date.toLocaleDateString()}</td>
              <td className="p-4 font-bold text-lg text-teal-400">{milestone.daysUntilDue}</td>
              <td className="p-4 text-center">
                {milestone.milestoneType === "completed" ? (
                  <FaCheckCircle className="text-teal-400 text-xl" />
                ) : milestone.milestoneType === "overdue" ? (
                  <FaExclamationTriangle className="text-red-500 animate-pulse text-xl" />
                ) : (
                  "⌛"
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </motion.table>
    </div>
  );
};

export default Meilensteine;
