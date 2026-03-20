import React, { useMemo } from "react";
import { FaRegCircle, FaTools, FaCheckCircle } from "react-icons/fa";
import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Progress } from "./components/ui/progress";

import { cn } from "./components/ui/utils";

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

const RESPONSIBLE_KEYS = [
  "Responsibles", "Responsible", "Verantwortlich", "Verantwortliche", "Verantwortliche(r)"
];
const parseResponsibles = (val) => {
  if (val == null && val !== 0) return [];
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
  const s = String(val);
  return s.split(/[\n,;\/|]+/g).map(t => t.trim()).filter(Boolean);
};

const HeutigeAufgaben = ({ data, projects, selectedProjects, gewerkFilter, bereichFilter, responsiblesFilter, searchTerm }) => {
  if (!data) return <p className="text-gray-500 text-lg text-center">Lade Daten...</p>;

  const today = new Date();
  const normalizedSearch = searchTerm?.toLowerCase().trim();

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

        const tradeName = row["Trade"]?.trim() || "";
        const processName = row["Process"]?.trim() || "";

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
        
        if (startDate <= today && today <= endDate) {
          const taktZoneKeys = Object.keys(row).filter((key) =>
            key.startsWith("TaktZone Level")
          );
          const maxTaktLevel = Math.max(
            ...taktZoneKeys.map((key) => parseInt(key.split(" ")[2])).filter((n) => !isNaN(n))
          );
          const bereich = row[`TaktZone Level ${maxTaktLevel}`] || "—";

          if (normalizedSearch) {
            const hit = 
              projectName.toLowerCase().includes(normalizedSearch) ||
              processName.toLowerCase().includes(normalizedSearch) ||
              tradeName.toLowerCase().includes(normalizedSearch) ||
              String(bereich).toLowerCase().includes(normalizedSearch) ||
              String(row["ID"]).toLowerCase().includes(normalizedSearch);
            
            if (!hit) return;
          }

          const totalWorkdays = countArbeitstage(startDate, endDate);
          const doneWorkdays = countArbeitstage(startDate, today);
          const sollProgress = totalWorkdays > 0 ? Math.min(100, Math.round((doneWorkdays / totalWorkdays) * 100)) : 0;
          
          results.push({
            projectId: projectMeta.projectId,
            project: projectName,
            id: row["ID"],
            process: processName,
            trade: tradeName,
            progress,
            soll: sollProgress,
            bereich,
          });
        }
      });
    });

    return results;
  }, [data, projects, selectedProjects, gewerkFilter, normalizedSearch]);

  return (
    <div className="p-6 w-full">
      <Card className="bg-white border-gray-200 text-gray-900 shadow-xl overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg font-bold tracking-tight text-center text-gray-800">
            Aktuelle Vorgänge
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayProcesses.length === 0 ? (
            <p className="text-gray-500 text-lg text-center py-10">
              Keine Aufgaben für heute.
            </p>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Table className="border border-gray-200">
                <TableHeader className="bg-gray-50">
                  <TableRow className="border-gray-200 hover:bg-transparent">
                    <TableHead className="text-gray-700 font-semibold">Projekt</TableHead>
                    <TableHead className="text-gray-700 font-semibold">ID</TableHead>
                    <TableHead className="text-gray-700 font-semibold">Vorgang</TableHead>
                    <TableHead className="text-gray-700 font-semibold">Gewerk</TableHead>
                    <TableHead className="text-gray-700 font-semibold">Bereich</TableHead>
                    <TableHead className="text-gray-700 font-semibold">Fortschritt</TableHead>
                    <TableHead className="text-gray-700 font-semibold">Soll-Fortschritt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-white divide-y divide-gray-100">
                  {todayProcesses.map((process) => (
                    <TableRow
                      key={`${process.project}-${process.id}`}
                      className="border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => {
                        window.open(
                          `https://share.lcmdigital.com/?project=${process.projectId}&processid=${process.id}`,
                          "_blank"
                        );
                      }}
                    >
                      <TableCell className="font-medium text-gray-900">
                        {process.project}
                      </TableCell>
                      <TableCell className="text-gray-600">{process.id}</TableCell>
                      <TableCell className="text-gray-600">{process.process}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-gray-700 border-gray-300">
                          {process.trade}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">{process.bereich}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 min-w-[100px]">
                          <div className="flex items-center gap-2">
                            {process.progress === 0 ? (
                              <FaRegCircle className="text-gray-400" />
                            ) : process.progress === 100 ? (
                              <FaCheckCircle className="text-[#10b981]" />
                            ) : (
                              <FaTools className="text-[#f59e0b] animate-spin" />
                            )}
                            <span className="text-xs font-semibold text-gray-700">
                              {process.progress}%
                            </span>
                          </div>
                          <Progress
                            value={process.progress}
                            className="h-1.5 bg-gray-100"
                            indicatorClassName="bg-[#10b981]"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 min-w-[100px]">
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              process.progress < process.soll
                                ? "text-[#ef4444] font-bold"
                                : "text-[#3b82f6]"
                            )}
                          >
                            {process.soll}%
                          </span>
                          <Progress
                            value={process.soll}
                            className="h-1.5 bg-gray-100"
                            indicatorClassName={process.progress < process.soll ? "bg-[#ef4444]" : "bg-[#3b82f6]"}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HeutigeAufgaben;
