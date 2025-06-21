import React, { useMemo } from "react";
import { FaRegCircle, FaTools, FaCheckCircle } from "react-icons/fa";
import { motion } from "framer-motion";

const excelDateToJSDate = (serial) => {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};
const FEIERTAGE_2025 = [
  "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-01", "2025-05-29",
  "2025-06-09", "2025-10-03", "2025-12-25", "2025-12-26",
];
const isFeiertag = (date) =>
  FEIERTAGE_2025.includes(date.toISOString().split("T")[0]);
const countArbeitstage = (start, end) => {
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    const isWeekend = day === 0 || day === 6;
    if (!isWeekend && !isFeiertag(current)) count++;
    current.setDate(current.getDate() + 1);
  }

  return count;
};

const HeutigeAufgaben = ({ data, projects, selectedProjects, gewerkFilter }) => {
  if (!data) return <p className="text-gray-400 text-lg text-center">Lade Daten...</p>;

  const today = new Date();

  const todayProcesses = useMemo(() => {
    const results = [];
    const seen = new Set();

    Object.keys(data).forEach((projectName) => {
      if (selectedProjects.length > 0 && !selectedProjects.includes(projectName)) return;

      const projectMeta = projects.find((p) => p.name === projectName);
      if (!projectMeta) return;

      data[projectName].forEach((row) => {
        const key = `${projectName}-${row["ID"]}`;
        if (seen.has(key)) return;
        seen.add(key);

        const startDate = excelDateToJSDate(row["Start Date"]);
        const endDate = excelDateToJSDate(row["End Date"]);
        const progress = Math.round(row["Status"] * 100);

        const tradeName = row["Trade"]?.trim();
        const isTradeIncluded =
          !gewerkFilter?.length || (tradeName && gewerkFilter.includes(tradeName));
        
        if (startDate <= today && today <= endDate && isTradeIncluded) {
          const totalWorkdays = countArbeitstage(startDate, endDate);
          const doneWorkdays = countArbeitstage(startDate, today);
          const sollProgress = totalWorkdays > 0 ? Math.min(100, Math.round((doneWorkdays / totalWorkdays) * 100)) : 0;
          const taktZoneKeys = Object.keys(row).filter((key) =>
            key.startsWith("TaktZone Level")
          );
          const maxTaktLevel = Math.max(
            ...taktZoneKeys.map((key) => parseInt(key.split(" ")[2])).filter((n) => !isNaN(n))
          );
          const bereich = row[`TaktZone Level ${maxTaktLevel}`] || "—";
          
          results.push({
            projectId: projectMeta.projectId,
            project: projectName,
            id: row["ID"],
            process: row["Process"],
            trade: tradeName,
            progress,
            soll: sollProgress,
            bereich,
          });
          
          
        }
        
      });
    });

    return results;
  }, [data, projects, selectedProjects, gewerkFilter]);

  return (
    <div className="p-6 font-inter text-white w-full">
      <div className="shadow-2xl rounded-3xl bg-[#111] p-8">
        <h2 className="text-3xl font-bold mb-6 text-center">
          🚀 Heute durchzuführende Prozesse
        </h2>

        {todayProcesses.length === 0 ? (
          <p className="text-gray-400 text-lg text-center">Keine Aufgaben für heute.</p>
        ) : (
          <motion.table
            className="w-full text-white border border-[#333] rounded-lg overflow-hidden text-left"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <thead className="bg-[#222]">
              <tr>
                <th className="p-4 border border-[#333]">Projekt</th>
                <th className="p-4 border border-[#333]">ID</th>
                <th className="p-4 border border-[#333]">Vorgang</th>
                <th className="p-4 border border-[#333]">Gewerk</th>
                <th className="p-4 border border-[#333]">Bereich</th>
                <th className="p-4 border border-[#333]">Fortschritt</th>
                <th className="p-4 border border-[#333]">Soll-Fortschritt</th>
              </tr>
            </thead>
            <tbody className="bg-[#1a1a1a] divide-y divide-[#333]">
              {todayProcesses.map((process) => (
                <motion.tr
                  onTap={() => {
                    window.open(
                      `https://share.lcmdigital.com/?project=${process.projectId}&processid=${process.id}`,
                      "_blank"
                    );
                  }}
                  key={`${process.project}-${process.id}`}
                  className="hover:bg-[#2e2e2e] transition duration-300 cursor-pointer"
                  whileHover={{ scale: 1.02 }}
                >
                  <td className="p-4">{process.project}</td>
                  <td className="p-4">{process.id}</td>
                  <td className="p-4">{process.process}</td>
                  <td className="p-4">{process.trade}</td>
                  <td className="p-4">{process.bereich}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 leading-none">
                      {process.progress === 0 ? (
                        <FaRegCircle className="text-gray-500 text-base" />
                      ) : process.progress === 100 ? (
                        <FaCheckCircle className="text-teal-400 text-base" />
                      ) : (
                        <FaTools className="text-yellow-400 animate-spin text-base" />
                      )}
                      <span className="text-sm">{process.progress}%</span>
                    </div>
                  </td>

                  <td
                    className={`p-4 ${
                      Math.abs(process.progress - process.soll) > 19
                        ? "text-red-500 font-semibold"
                        : ""
                    }`}
                  >
                    {process.soll}%
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </motion.table>
        )}
      </div>
    </div>
  );
};

export default HeutigeAufgaben;
