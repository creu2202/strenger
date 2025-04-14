import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

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
    if (!selectedProject || !data[selectedProject]) return;

    setSelectedTrade(null); // fix für Projektwechsel
    setExpanded({});

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
          ...prev[selectedProject],
          [selectedTrade]: value,
        },
      };
      localStorage.setItem("auftragssummen", JSON.stringify(updated));
      return updated;
    });
  };

  if (!selectedTrade) {
    return (
      <div className="p-6 font-inter text-white w-full">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="grid gap-4"
        >
          {projektGewerke.map((gewerk) => {
            const info = gesamtStatusMap[gewerk];
            if (!info) return null;
            const status = info.totalDuration > 0 ? (info.tree.__meta?.__statusSum || 0) / info.totalDuration : 0;
            return (
              <div
                key={gewerk}
                onClick={() => setSelectedTrade(gewerk)}
                className="bg-[#1a1a1a] p-6 rounded-2xl shadow hover:bg-[#2a2a2a] cursor-pointer transition-all"
              >
                <div className="text-2xl font-bold mb-4">{gewerk}</div>
                <div className="w-full mb-2">
                  <ProgressBar value={status} />
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>0 €</span>
                  <span className="text-white font-medium">
                    {((info.tree.__meta?.__statusSum || 0) / info.totalDuration * (auftragssummen[selectedProject]?.[gewerk] || 0)).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
                  </span>
                  <span>{auftragssummen[selectedProject]?.[gewerk]?.toLocaleString("de-DE", { maximumFractionDigits: 0 }) || "0"} €</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400 mt-1">
                  <span>0%</span>
                  <span className="text-white font-medium">Abrechenbarer Anteil ({Math.round(status * 100)}%)</span>
                  <span>100%</span>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-6 font-inter text-white w-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-[#1a1a1a] rounded-2xl p-6 shadow-xl"
      >
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setSelectedTrade(null)}
            className="text-sm bg-[#00e0d6] text-black px-3 py-1 rounded hover:bg-[#00bfa5]"
          >
            ← Zurück
          </button>
          <div>
            <label className="mr-2 text-sm">Nur abrechenbare Leistungen:</label>
            <select
              value={showOnlyProgress ? "true" : "false"}
              onChange={(e) => setShowOnlyProgress(e.target.value === "true")}
              className="bg-[#111] text-white border border-[#333] rounded px-2 py-1 text-sm"
            >
              <option value="false">Alle</option>
              <option value="true">Nur mit Status</option>
            </select>
          </div>
        </div>
        <div className="text-2xl font-bold mb-4">{selectedTrade}</div>
        <div className="mb-6 w-full bg-[#111] rounded-xl p-4 border border-[#333]">
          <div className="flex justify-between mb-2 text-sm text-gray-400">
            <span>0 €</span>
            <span className="text-white font-semibold">
              {((currentInfo?.tree.__meta?.__statusSum || 0) / currentInfo.totalDuration * currentInfo.gewerkSumme).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
            </span>
            <span>{currentInfo.gewerkSumme.toLocaleString("de-DE") || "0"} €</span>
          </div>
          <div className="w-full h-6 bg-[#333] rounded-full overflow-hidden border border-[#555] relative">
            <div
              className="h-full bg-[#00e0d6] transition-all"
              style={{ width: `${Math.round(
                currentInfo.totalDuration > 0
                  ? (currentInfo.tree.__meta?.__statusSum || 0) / currentInfo.totalDuration * 100
                  : 0
              )}%` }}
            ></div>
            <span className="absolute inset-0 flex items-center justify-center text-sm text-white font-semibold">
              {Math.round(
                currentInfo.totalDuration > 0
                  ? (currentInfo.tree.__meta?.__statusSum || 0) / currentInfo.totalDuration * 100
                  : 0
              )}%
            </span>
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-400">
            <span>0%</span>
            <span className="text-white font-medium">
              Abrechenbarer Anteil: {((currentInfo?.tree.__meta?.__statusSum || 0) / currentInfo.totalDuration * currentInfo.gewerkSumme).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
            </span>
            <span>100%</span>
          </div>
        </div>
        <div className="mb-4 flex items-center gap-4">
          <span className="text-sm text-gray-400">Auftragssumme</span>
          <input
            type="text"
            value={inputValue || currentInfo.gewerkSumme.toLocaleString("de-DE") || ""}
            onChange={handleSummeChange}
            className="bg-[#111] border border-[#333] rounded px-2 py-1 text-sm text-white w-32"
          />
          <span className="text-sm text-gray-400">€</span>
        </div>
        {renderNode(currentInfo.tree, "", 0, currentInfo.totalDuration, currentInfo.gewerkSumme, currentInfo.totalDuration)}
      </motion.div>
    </div>
  );
};

export default StrukturModul;
