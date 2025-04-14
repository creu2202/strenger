import React, { useMemo } from "react";
import { FaRegCircle, FaTools, FaCheckCircle } from "react-icons/fa";
import { motion } from "framer-motion";

const excelDateToJSDate = (serial) => {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};

const HeutigeAufgaben = ({ data, projects, selectedProjects }) => {
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

        if (startDate <= today && today <= endDate) {
          results.push({
            projectId: projectMeta.projectId,
            project: projectName,
            id: row["ID"],
            process: row["Process"],
            trade: row["Trade"],
            progress,
          });
        }
      });
    });

    return results;
  }, [data, projects, selectedProjects]);

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
                <th className="p-4 border border-[#333]">Fortschritt</th>
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
                  <td className="p-4 flex items-center gap-2">
                    {process.progress === 0 ? (
                      <FaRegCircle className="text-gray-500" />
                    ) : process.progress === 100 ? (
                      <FaCheckCircle className="text-teal-400" />
                    ) : (
                      <FaTools className="text-yellow-400 animate-spin" />
                    )}
                    {process.progress}%
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
