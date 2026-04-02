import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import Image from "next/image";
import Logo from "./lcmd_logo_black.svg";
import { FaTasks, FaFlagCheckered, FaRedo, FaSearch } from "react-icons/fa";
import { Check, ChevronDown, X, ListFilter, GanttChartIcon, Binoculars, BarChart3, LayoutDashboard, ListTodo } from "lucide-react"
import Fortschritt from "./Fortschritt";
import GanttChart from "./GanttChart";
import HeutigeAufgaben from "./HeutigeAufgaben";
import Meilensteine from "./Meilensteine";
import MultiProzesse from "./MultiProzesse";
import Overview from "./Overview";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { cn } from "./components/ui/utils";
import { MultiSelect } from "./components/ui/multi-select";

const PROJECT_TABS = {
  overview: { label: "Übersicht", icon: LayoutDashboard },
  progress: { label: "Fortschritt", icon: BarChart3 },
  gantt: { label: "Gantt", icon: GanttChartIcon },
  tasks: { label: "Vorgänge", icon: ListTodo },
  milestones: { label: "Milestones", icon: FaFlagCheckered },
  multiProzesse: { label: "6-Wochen Vorschau", icon: Binoculars },
}
// ---- Helper für "Responsibles" (gleich wie im Modul) ------------------------
const RESPONSIBLE_KEYS = [
  "Responsibles", "Responsible", "Verantwortlich", "Verantwortliche", "Verantwortliche(r)"
];
// robust: Array, "A, B", "A;B", "A/B", "A|B", Zeilenumbrüche
const parseResponsibles = (val) => {
  if (val == null && val !== 0) return [];
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
  const s = String(val);
  return s.split(/[\n,;\/|]+/g).map(t => t.trim()).filter(Boolean);
};

const PROJECTS = [
    { name: "Berlin", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=c200addc-f9f9-480e-8eb9-9329769ef859", projectId: "c200addc-f9f9-480e-8eb9-9329769ef859" },
    { name: "Köln", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=7a3c9314-f7b3-4dfd-b878-4b9d30769377", projectId: "7a3c9314-f7b3-4dfd-b878-4b9d30769377" },
    { name: "München", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=7dfbedbb-9966-469e-9c0c-6c9dfbf66516", projectId: "7dfbedbb-9966-469e-9c0c-6c9dfbf66516" },
];

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3N2U3OGMyMC0yNmVhLTQ3OWQtYjIzMS00MGRkNzIxYWZiNDEiLCJlbWFpbCI6ImNocmlzdGlhbi5yZXV0ZXJAbGNtZGlnaXRhbC5jb20iLCJ0cyI6NjQ4LCJsaWMiOnsiZWRpdCI6MX0sImlhdCI6MTc0MTE4MzQ5Mn0.a42tshg1OH8gzYu0AsEaeymx8ebWOdNA2rZzz9rdd1c";

const fetchData = async () => {
  let projectData = {};
  for (const project of PROJECTS) {
    try {
      const response = await fetch(project.url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawItems = XLSX.utils.sheet_to_json(sheet);

      // Normalisierung der Keys von Excel (Spaltennamen) zu Dashboard-Erwartung
      const normalized = rawItems.map(item => {
        const findVal = (row, keys) => {
          for (const k of keys) {
            const lowK = k.toLowerCase();
            const actualKey = Object.keys(row).find(rk => rk.toLowerCase() === lowK);
            if (actualKey) return row[actualKey];
          }
          return null;
        };

        return {
          ...item,
          "Process": findVal(item, ["Process", "ProcessName", "Process Name", "Vorgang", "Task", "Bezeichnung", "Titel", "Name"]),
          "Start Date": findVal(item, ["Start Date", "Start", "StartDate", "Starttermin", "Anfang"]),
          "End Date": findVal(item, ["End Date", "End", "EndDate", "Endtermin", "Finish"]),
          "Trade": findVal(item, ["Trade", "Gewerk"]),
          "Status": findVal(item, ["Status", "Progress", "Fortschritt"]),
          "Process Id": findVal(item, ["Process Id", "ProcessID", "ProcessId", "Prozess Id", "ProzessID", "Process GUID", "Process Guid", "ProcessGUID", "ID"]),
          "Bereich": findVal(item, ["Bereich", "Area", "Taktzone"]),
          "Responsibles": findVal(item, ["Responsibles", "Responsible", "Verantwortlich", "Verantwortliche", "Verantwortliche(r)"]),
          "Trade Color": findVal(item, ["Trade Background Color", "Trade BG Color", "Trade Color", "Gewerk Farbe", "TradeColor"])
        };
      });

      projectData[project.name] = normalized;
    } catch (error) {
      console.error(`Error fetching project ${project.name}:`, error);
      projectData[project.name] = [];
    }
  }
  return projectData;
};

// Zusätzliche Karten-Daten (Tasks) laden: &cards=1
const fetchPeopleByProcess = async () => {
  const byProject = {};
  for (const project of PROJECTS) {
    try {
      const response = await fetch(`${project.url}&cards=1`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      const map = {}; // processId -> (dateKey -> sum)
      
      for (const row of data) {
        // Bei Excel sind die Keys die Spaltennamen der ersten Zeile
        const findVal = (row, keys) => {
          for (const k of keys) {
            const lowK = k.toLowerCase();
            const actualKey = Object.keys(row).find(rk => rk.toLowerCase() === lowK);
            if (actualKey) return row[actualKey];
          }
          return null;
        };

        const processId = findVal(row, ["Process Id", "ProcessID", "ProcessId", "Prozess Id", "ProzessID", "Process GUID", "Process Guid", "ProcessGUID", "ID"]) || row.processId || row.processID || row.ProcessId || row.ProcessID;
        if (!processId) continue;

        const personsRaw = findVal(row, ["Workforce", "Persons", "Personen", "People", "Anzahl Personen", "Ressourcen", "Ressource"]) || row.Workforce || row.Persons || row.Personen || row.People;
        const num = Number(String(personsRaw ?? "").replace(",", ".").trim());
        const val = isFinite(num) ? num : null;
        if (val == null || val === 0) continue;

        let dateKey = null;
        const dRaw = findVal(row, ["Date", "Datum", "Task Date", "Card Date"]);
        if (dRaw) {
          let parsed;
          if (typeof dRaw === "number" && dRaw > 40000) {
             const utc_days = Math.floor(dRaw - 25569);
             const utc_value = utc_days * 86400;
             parsed = new Date(utc_value * 1000);
          } else {
             parsed = new Date(dRaw);
          }

          if (!isNaN(parsed)) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, "0");
            const day = String(parsed.getDate()).padStart(2, "0");
            dateKey = `${y}-${m}-${day}`;
          }
        }

        const pid = String(processId);
        if (!map[pid]) map[pid] = {};
        const key = dateKey || "__total__";
        map[pid][key] = (map[pid][key] || 0) + val;
      }
      byProject[project.name] = map;
    } catch (e) {
      console.error(`Error fetching cards for ${project.name}:`, e);
      byProject[project.name] = {};
    }
  }
  return byProject;
};


const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [peopleByProcess, setPeopleByProcess] = useState(null);

  const [mode] = useState("multi");
  const [activeTab, setActiveTab] = useState("overview");

  const [selectedProjects, setSelectedProjects] = useState([]);
  const [selectedGewerke, setSelectedGewerke] = useState([]);
  const [selectedBereiche, setSelectedBereiche] = useState([]);
  const [selectedResponsibles, setSelectedResponsibles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [initialViewMode, setInitialViewMode] = useState(null);

  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  useEffect(() => {
    (async () => {
      try {
        const [fetchedData, peopleMap] = await Promise.all([
          fetchData(),
          fetchPeopleByProcess(),
        ]);
        setData(fetchedData);
        setPeopleByProcess(peopleMap);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const availableTabs = ["overview", "progress", "gantt", "tasks", "milestones", "multiProzesse"];

  const alleGewerke = useMemo(() => data
    ? [...new Set(
        Object.values(data)
          .flatMap((prozesse) => prozesse.map((p) => p.Trade?.trim()))
          .filter(Boolean)
      )].sort()
    : []
  , [data]);

  const alleBereiche = useMemo(() => data
    ? [
        ...new Set(
          Object.values(data).flatMap((rows) =>
            rows.flatMap((row) => {
              const levels = Object.keys(row)
                .filter((k) => k.startsWith("TaktZone Level"))
                .map((k) => [parseInt(k.split(" ")[2], 10), row[k]])
                .filter(([lvl, val]) => !isNaN(lvl) && val != null && String(val).trim() !== "")
                .sort((a, b) => a[0] - b[0])
                .map(([, v]) => String(v).trim());
              const prefixes = [];
              for (let i = 1; i <= levels.length; i++) {
                const p = levels.slice(0, i).join(" / ");
                if (p) prefixes.push(p);
              }
              if (prefixes.length === 0) {
                const fallback = String(row["Bereich"] || row["Area"] || "").trim();
                if (fallback) {
                  const parts = fallback.split("/").map((s) => s.trim()).filter(Boolean);
                  if (parts.length > 1) {
                    const fbPrefixes = [];
                    for (let i = 1; i <= parts.length; i++) {
                      fbPrefixes.push(parts.slice(0, i).join(" / "));
                    }
                    return fbPrefixes;
                  }
                  return [fallback];
                }
              }
              return prefixes;
            })
          )
        ),
      ].sort((a, b) => a.localeCompare(b, "de"))
    : []
  , [data]);

  const alleResponsibles = useMemo(() => data
    ? [
        ...new Set(
          Object.values(data)
            .flatMap(rows =>
              rows.flatMap(row =>
                parseResponsibles(
                  row.Responsibles ?? row.Responsible ?? row.Verantwortlich ?? row["Verantwortliche(r)"]
                )
              )
            )
            .map(r => r.trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b, "de"))
    : []
  , [data]);

  const activeFilterCount =
    selectedProjects.length + selectedGewerke.length + selectedBereiche.length + selectedResponsibles.length + (searchTerm ? 1 : 0);

  const renderModule = () => {
    if (loading) return <p className="text-center text-gray-400 py-6">Lade Daten…</p>;

    const handleProjectSelect = (projectName, targetTab = "progress", viewMode = null) => {
      if (projectName === null) {
        setSelectedProjects([]);
      } else {
        setSelectedProjects([projectName]);
      }
      setInitialViewMode(viewMode);
      setActiveTab(targetTab);
    };

    const handleOpenInLCMD = (projectName, processId) => {
      const project = PROJECTS.find(p => p.name === projectName);
      if (project && project.projectId) {
        let url = `https://share.lcmdigital.com/?project=${project.projectId}`;
        if (processId) {
          url += `&processid=${processId}`;
        }
        window.open(url, "_blank");
      }
    };

    const sharedProps = {
      data,
      projects: PROJECTS,
      selectedProjects,
      searchTerm,
      gewerkFilter: selectedGewerke,
      bereichFilter: selectedBereiche,
      responsiblesFilter: selectedResponsibles,
      onTabChange: setActiveTab,
      onProjectSelect: handleProjectSelect,
      onOpenInLCMD: handleOpenInLCMD,
      initialViewMode
    };
    switch (activeTab) {
      case "overview": return <Overview {...sharedProps} />;
      case "progress": return <Fortschritt {...sharedProps} selectedBauleiterProjects={{}} onClearInitialMode={() => setInitialViewMode(null)} />;
      case "gantt": return <GanttChart {...sharedProps} />;
      case "tasks": return <HeutigeAufgaben {...sharedProps} />;
      case "milestones": return <Meilensteine {...sharedProps} />;
      case "multiProzesse":
        return (
          <MultiProzesse
            data={data}
            projects={PROJECTS}
            selectedProjects={selectedProjects}
            gewerkFilter={selectedGewerke}
            bereichFilter={selectedBereiche}
            responsiblesFilter={selectedResponsibles}
            peopleByProcess={peopleByProcess}
            searchTerm={searchTerm}
          />
        );
      default: return null;
    }
  };

  return (
    <div className="bg-background text-foreground min-h-screen font-inter pb-8">
      {/* Sticky kompakte Top-Bar */}
      <div className="sticky top-0 z-50 backdrop-blur shadow-sm border-b bg-background/95">
        {/* Top-Row (Brand & Filters) - Schwarz */}
        <div className="bg-black text-white px-4 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-end gap-4">
            <div className="flex items-center bg-transparent rounded pb-0.5">
              <Image src={Logo} alt="lcmd" className="h-6 w-auto invert" />
            </div>
            <div className="hidden lg:block">
              <h1 className="text-xl font-bold tracking-tight text-white leading-none">Projekt Portfolio</h1>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/50" />
              <input
                type="text"
                placeholder="Suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 w-40 lg:w-64 bg-white/10 border border-white/20 rounded-md pl-8 pr-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn("h-8 gap-2 border-white/20 hover:bg-white/10 text-white", activeFilterCount > 0 && "border-primary bg-primary/20")}
            >
              <ListFilter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filter</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.reload()}
              className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
              title="Daten neu laden"
            >
              <FaRedo className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Tabs (kompakt, scrollbar) - Wie der Meilenstein Filter */}
        <div className="px-4 border-t flex items-center h-12 bg-white">
          <div className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-100 p-1 text-zinc-500 overflow-x-auto no-scrollbar max-w-full">
            {availableTabs.map((tab) => {
              const tabConfig = PROJECT_TABS[tab];
              if (!tabConfig) return null;
              const TabIcon = tabConfig.icon;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === "overview") {
                      setSelectedProjects([]);
                    }
                  }}
                  className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 gap-2 flex-shrink-0",
                    isActive
                      ? "bg-white text-zinc-950 shadow-sm"
                      : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-950"
                  )}
                >
                  <TabIcon className={cn("h-4 w-4", isActive ? "text-primary" : "text-zinc-400")} />
                  <span>{tabConfig.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={cn("w-full mx-auto mt-6", activeTab === "tasks" ? "px-0" : "px-4")}>
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="mb-6 relative z-40"
              style={{ overflow: filtersOpen ? "visible" : "hidden" }}
            >
              <Card className="overflow-visible">
                <CardHeader className="pb-3 pt-4 overflow-visible">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ListFilter className="h-4 w-4 text-primary" /> Filter-Optionen
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-visible">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Projekte */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Projekte vergleichen
                      </label>
                      <MultiSelect
                        options={PROJECTS.map((p) => ({ label: p.name, value: p.name }))}
                        value={selectedProjects}
                        onChange={setSelectedProjects}
                        placeholder="Projekte…"
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gewerke</label>
                      <MultiSelect
                        options={alleGewerke.map((g) => ({ value: g, label: g }))}
                        value={selectedGewerke}
                        onChange={setSelectedGewerke}
                        placeholder="Alle Gewerke…"
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bereiche</label>
                      <MultiSelect
                        options={alleBereiche.map((b) => ({ value: b, label: b }))}
                        value={selectedBereiche}
                        onChange={setSelectedBereiche}
                        placeholder="Alle Bereiche…"
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Verantwortliche</label>
                      <MultiSelect
                        options={alleResponsibles.map((r) => ({ value: r, label: r }))}
                        value={selectedResponsibles}
                        onChange={setSelectedResponsibles}
                        placeholder="Alle Personen…"
                        className="text-sm"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="w-full">
          {renderModule()}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
