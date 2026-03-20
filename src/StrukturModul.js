import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Progress } from "./components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

const StrukturModul = ({ data, selectedProject }) => {
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [strukturTree, setStrukturTree] = useState({});
  const [expanded, setExpanded] = useState({});
  const [auftragssummen, setAuftragssummen] = useState({});
  const [inputValue, setInputValue] = useState("");
  const [projektGewerke, setProjektGewerke] = useState([]);
  const [gesamtStatusMap, setGesamtStatusMap] = useState({});
  const [showOnlyProgress, setShowOnlyProgress] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("auftragssummen");
    const parsed = saved ? JSON.parse(saved) : {};
    setAuftragssummen(parsed);
  }, []);

  useEffect(() => {
    setSelectedTrade(null);
    setExpanded({});
    setInputValue("");
  }, [selectedProject]);

  useEffect(() => {
    setInputValue("");
  }, [selectedTrade]);

  useEffect(() => {
    if (!selectedProject || !data[selectedProject]) return;

    const gewerke = Array.from(new Set(data[selectedProject].map((r) => r.Trade).filter(Boolean)));
    const sortedGewerke = gewerke.sort((a, b) => {
      const sumA = auftragssummen[selectedProject]?.[a] || 0;
      const sumB = auftragssummen[selectedProject]?.[b] || 0;
      if (sumA === sumB) return a.localeCompare(b);
      return sumB - sumA;
    });
    setProjektGewerke(sortedGewerke);

    const statusMap = {};

    gewerke.forEach((trade) => {
      const rows = data[selectedProject].filter((r) => r.Trade === trade);

      const tree = {};
      let totalDuration = rows.reduce((sum, r) => sum + parseInt(r.Duration || 0), 0);
      const processNodes = [];
      const gewerkSumme = auftragssummen[selectedProject]?.[trade] || 0;

      rows.forEach((row, index) => {
        const ebeneSpalten = Object.keys(row)
          .filter((k) => k.startsWith("TaktZone Level"))
          .sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")));

        const path = ebeneSpalten.map((k) => row[k]).filter(Boolean);
        const processKey = `${row.Process}__${row.ID || index}`;
        path.push(processKey);

        let current = tree;
        path.forEach((segment, i) => {
          if (!current[segment]) {
            current[segment] = {
              __children: {},
              __depth: i,
              __duration: 0,
              __isProcess: false,
              __childrenDuration: 0,
              __childrenSum: 0,
              __statusSum: 0,
              __status: 0,
            };
          }

          if (i === path.length - 1) {
            const duration = parseInt(row.Duration || 0);
            current[segment].__isProcess = true;
            current[segment].__duration = duration;
            current[segment].__status = parseFloat(row.Status || 0);
            processNodes.push({ path, duration, status: current[segment].__status });
          }

          current = current[segment].__children;
        });
      });

      processNodes.forEach(({ path, duration, status }) => {
        let current = tree;
        let sum = totalDuration > 0 ? (duration / totalDuration) * gewerkSumme : 0;
        path.forEach((segment) => {
          if (!current[segment]) return;
          current[segment].__childrenDuration = (current[segment].__childrenDuration || 0) + duration;
          current[segment].__childrenSum = (current[segment].__childrenSum || 0) + sum;
          current[segment].__statusSum = (current[segment].__statusSum || 0) + duration * status;
          current = current[segment].__children;
        });
      });

      tree.__meta = {
        __statusSum: processNodes.reduce((sum, p) => sum + p.duration * p.status, 0),
      };

      statusMap[trade] = {
        tree,
        totalDuration,
        gewerkSumme,
      };
    });

    setGesamtStatusMap(statusMap);
  }, [selectedProject, data, auftragssummen]);

  const toggleExpand = (path) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const ProgressBar = ({ value }) => {
    const percent = Math.round((value || 0) * 100);
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-3 bg-[#333] rounded-full overflow-hidden border border-[#555]">
          <div
            className={`h-full ${value === 1 ? "bg-[#00ff88]" : "bg-[#00e0d6]"} transition-all`}
            style={{ width: `${percent}%` }}
          ></div>
        </div>
        <span className="text-sm text-white w-12 text-right">{percent}%</span>
      </div>
    );
  };

  const renderNode = (node, path = "", depth = 0, parentDuration, parentSum, rootDuration) => {
    if (!node) return null;
    return Object.entries(node)
      .filter(([key, val]) => {
        const show = typeof val === "object" && val !== null && val.__depth !== undefined;
        if (!show) return false;
        if (showOnlyProgress && val.__isProcess && (val.__status || 0) <= 0) return false;
        return true;
      })
      .map(([key, val]) => {
        const cleanedKey = key.replace(/__\d+$/, "");
        const fullPath = path ? `${path}/${key}` : key;
        const isOpen = expanded[fullPath];
        const prozent = rootDuration > 0 ? ((val.__childrenDuration / rootDuration) * 100).toFixed(1) : "0.0";
        const betragEinzeln = val.__isProcess
          ? ((val.__duration / rootDuration) * parentSum * (val.__status || 0)).toLocaleString("de-DE", { maximumFractionDigits: 0 })
          : ((val.__statusSum / rootDuration) * parentSum).toLocaleString("de-DE", { maximumFractionDigits: 0 });
        const totalBetrag = val.__isProcess
          ? ((val.__duration / rootDuration) * parentSum).toLocaleString("de-DE", { maximumFractionDigits: 0 })
          : ((val.__childrenSum || 0)).toLocaleString("de-DE", { maximumFractionDigits: 0 });

        const status = val.__isProcess
          ? val.__status || 0
          : val.__childrenDuration > 0
            ? val.__statusSum / val.__childrenDuration
            : 0;

        const hide = showOnlyProgress && val.__isProcess && status <= 0;
        if (hide) return null;

        return (
          <div key={fullPath} className="py-2" style={{ paddingLeft: `${depth * 16}px` }}>
            <div
              className={`flex items-center gap-2 bg-[#1a1a1a] text-white p-3 rounded-xl shadow hover:bg-[#2a2a2a] cursor-pointer transition-all`}
              onClick={() => !val.__isProcess && toggleExpand(fullPath)}
            >
              {!val.__isProcess && <span>{isOpen ? <FaChevronDown /> : <FaChevronRight />}</span>}
              <span className={`font-medium ${val.__isProcess ? "italic" : ""}`}>{cleanedKey}</span>
              <span className="ml-auto text-sm text-gray-400 whitespace-nowrap">
                {`${prozent} % • ${totalBetrag} €`}
              </span>
              <ProgressBar value={status} />
              {val.__isProcess && (
                <span className="text-sm text-white whitespace-nowrap ml-2">
                  {`${betragEinzeln} €`}
                </span>
              )}
              {!val.__isProcess && (
                <span className="text-sm text-white whitespace-nowrap ml-2">
                  {`${betragEinzeln} €`}
                </span>
              )}
            </div>
            {!val.__isProcess && isOpen && (
              <div className="ml-6 border-l border-gray-700 pl-4">
                <AnimatePresence>
                  {renderNode(val.__children, fullPath, depth + 1, val.__childrenDuration, parentSum, rootDuration)}
                </AnimatePresence>
              </div>
            )}
          </div>
        );
      });
  };

  const currentInfo = gesamtStatusMap[selectedTrade];

  const handleSummeChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    const value = parseInt(raw || "0");
    setInputValue(e.target.value);
    setAuftragssummen((prev) => {
      const updated = {
        ...prev,
        [selectedProject]: {
          ...(prev[selectedProject] || {}),
          [selectedTrade]: value,
        },
      };
      localStorage.setItem("auftragssummen", JSON.stringify(updated));
      return updated;
    });
  };

  if (!selectedTrade) {
    return (
      <div className="p-6 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projektGewerke.map((gewerk) => {
            const info = gesamtStatusMap[gewerk];
            if (!info) return null;
            const status = info.totalDuration > 0 ? (info.tree.__meta?.__statusSum || 0) / info.totalDuration : 0;
            return (
              <Card
                key={gewerk}
                onClick={() => setSelectedTrade(gewerk)}
                className="cursor-pointer hover:border-primary/50 transition-colors shadow-sm"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">{gewerk}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Fortschritt</span>
                      <span>{Math.round(status * 100)}%</span>
                    </div>
                    <Progress value={status * 100} className="h-2" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted p-2 rounded-md">
                      <div className="text-muted-foreground mb-1 text-[10px] uppercase font-bold tracking-wider">Abrechenbar</div>
                      <div className="font-bold text-sm">
                        {((info.tree.__meta?.__statusSum || 0) / info.totalDuration * (auftragssummen[selectedProject]?.[gewerk] || 0)).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
                      </div>
                    </div>
                    <div className="bg-muted p-2 rounded-md">
                      <div className="text-muted-foreground mb-1 text-[10px] uppercase font-bold tracking-wider">Gesamt</div>
                      <div className="font-bold text-sm">
                        {auftragssummen[selectedProject]?.[gewerk]?.toLocaleString("de-DE", { maximumFractionDigits: 0 }) || "0"} €
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="border-b pb-4">
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedTrade(null)}
              className="gap-2"
            >
              ← Zurück zur Übersicht
            </Button>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground uppercase">Filter:</label>
              <select
                value={showOnlyProgress ? "true" : "false"}
                onChange={(e) => setShowOnlyProgress(e.target.value === "true")}
                className="bg-muted border rounded px-2 py-1 text-xs outline-none"
              >
                <option value="false">Alle Leistungen</option>
                <option value="true">Nur abrechenbare</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <CardTitle className="text-3xl font-bold">{selectedTrade}</CardTitle>
            <CardDescription>Detaillierte Kostenstruktur und Leistungsstand.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="col-span-2 space-y-4">
               <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <div className="text-sm font-semibold">Leistungsstand ({Math.round(
                      currentInfo.totalDuration > 0
                        ? (currentInfo.tree.__meta?.__statusSum || 0) / currentInfo.totalDuration * 100
                        : 0
                    )}%)</div>
                    <div className="text-sm text-muted-foreground font-medium">
                      {((currentInfo?.tree.__meta?.__statusSum || 0) / currentInfo.totalDuration * currentInfo.gewerkSumme).toLocaleString("de-DE", { maximumFractionDigits: 0 })} € von {currentInfo.gewerkSumme.toLocaleString("de-DE") || "0"} €
                    </div>
                  </div>
                  <Progress 
                    value={currentInfo.totalDuration > 0 ? (currentInfo.tree.__meta?.__statusSum || 0) / currentInfo.totalDuration * 100 : 0} 
                    className="h-4"
                  />
               </div>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 border flex flex-col justify-center">
              <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 tracking-wider">Gesamte Auftragssumme</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputValue || currentInfo.gewerkSumme.toLocaleString("de-DE") || ""}
                  onChange={handleSummeChange}
                  className="bg-background border rounded-md px-3 py-1.5 text-lg font-bold w-full focus:ring-2 focus:ring-primary outline-none transition-all"
                />
                <span className="font-bold text-xl text-muted-foreground">€</span>
              </div>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            {renderNode(currentInfo.tree, "", 0, currentInfo.totalDuration, currentInfo.gewerkSumme, currentInfo.totalDuration)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StrukturModul;
