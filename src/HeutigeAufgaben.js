import React, { useMemo } from "react";
import { FaRegCircle, FaTools, FaCheckCircle } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
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

        const startDate = parseDate(row["Start Date"]);
        const endDate = parseDate(row["End Date"]);
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
  }, [data, projects, selectedProjects, gewerkFilter, bereichFilter, responsiblesFilter, searchTerm]);

  return (
    <div className="p-6 w-full max-w-[1600px] mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-800">Aktuelle Vorgänge</h2>
          <p className="text-slate-500 mt-1 font-medium">Alle laufenden Aufgaben im Portfolio für den heutigen Tag.</p>
        </div>
        <Badge variant="outline" className="w-fit px-4 py-1.5 border-blue-200 bg-blue-50 text-blue-700 font-bold">
          {todayProcesses.length} Aufgaben aktiv
        </Badge>
      </motion.div>

      <Card className="bg-white/80 backdrop-blur-md border-slate-200 shadow-2xl rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-primary/5">
        <CardContent className="p-0">
          {todayProcesses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-4">
              <div className="p-6 bg-slate-50 rounded-full">
                <FaRegCircle className="h-12 w-12 text-slate-300" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Alles erledigt!</h3>
                <p className="text-slate-500">Keine Aufgaben für heute geplant.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-400 py-5 px-6">Projekt</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-400 py-5">ID</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-400 py-5">Vorgang</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-400 py-5">Gewerk</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-400 py-5">Bereich</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-400 py-5">Fortschritt</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-400 py-5 px-6 text-right">Soll</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {todayProcesses.map((process, index) => (
                      <motion.tr
                        key={`${process.project}-${process.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group border-slate-100 hover:bg-slate-50/80 transition-all cursor-pointer"
                        onClick={() => {
                          window.open(
                            `https://share.lcmdigital.com/?project=${process.projectId}&processid=${process.id}`,
                            "_blank"
                          );
                        }}
                      >
                        <TableCell className="py-5 px-6">
                          <span className="font-black text-slate-800 group-hover:text-primary transition-colors">{process.project}</span>
                        </TableCell>
                        <TableCell className="py-5">
                          <Badge variant="secondary" className="font-mono text-[10px] bg-slate-100 text-slate-500 border-none group-hover:bg-white transition-colors tracking-tighter">
                            {process.id}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-5 font-bold text-slate-600 max-w-[200px] truncate">{process.process}</TableCell>
                        <TableCell className="py-5">
                          <Badge variant="outline" className="font-bold border-slate-200 bg-white group-hover:border-primary/20 transition-all">
                            {process.trade}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-5">
                           <span className="text-xs font-semibold text-slate-400">{process.bereich}</span>
                        </TableCell>
                        <TableCell className="py-5">
                          <div className="flex flex-col gap-2 min-w-[140px]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {process.progress === 0 ? (
                                  <FaRegCircle className="text-slate-300 h-3 w-3" />
                                ) : process.progress === 100 ? (
                                  <FaCheckCircle className="text-emerald-500 h-3 w-3" />
                                ) : (
                                  <FaTools 
                                    className={cn(
                                      "h-3 w-3 animate-spin-slow",
                                      process.progress < process.soll - 10 ? "text-orange-500" : "text-blue-500"
                                    )} 
                                  />
                                )}
                                <span className="text-sm font-black text-slate-800">
                                  {process.progress}%
                                </span>
                              </div>
                            </div>
                            <div className="relative h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${process.progress}%` }}
                                className={cn(
                                  "h-full rounded-full transition-all duration-1000",
                                  process.progress >= 100 ? "bg-emerald-500" : 
                                  process.progress < process.soll - 10 ? "bg-orange-500" : "bg-blue-500"
                                )}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-5 px-6 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn(
                              "text-xs font-black",
                              process.progress < process.soll ? "text-red-500" : "text-blue-600"
                            )}>
                              {process.soll}%
                            </span>
                            <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={cn("h-full transition-all duration-700", process.progress < process.soll ? "bg-red-400" : "bg-blue-400")}
                                style={{ width: `${process.soll}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HeutigeAufgaben;
