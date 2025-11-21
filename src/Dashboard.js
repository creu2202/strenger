import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Select from "react-select";
import * as XLSX from "xlsx";
import Image from "next/image";
import Logo from "./lcmd_logo_white.svg";
import { FaChartBar, FaCalendarAlt, FaTasks, FaFlagCheckered, FaSitemap, FaSlidersH } from "react-icons/fa";
import Fortschritt from "./Fortschritt";
import GanttChart from "./GanttChart";
import HeutigeAufgaben from "./HeutigeAufgaben";
import Meilensteine from "./Meilensteine";
import StrukturModul from "./StrukturModul";
import AuftragssummenModul from "./AuftragssummenModul";
import ProzessGruppierungModul from "./ProzessGruppierungModul";
import GruppenGanttModul from "./GruppenGanttModul";
import MultiProzesse from "./MultiProzesse";

const PROJECT_TABS = {
  progress: { label: "Fortschritt", icon: FaChartBar },
  gantt: { label: "Gantt", icon: FaCalendarAlt },
  tasks: { label: "Tasks", icon: FaTasks },
  milestones: { label: "Milestones", icon: FaFlagCheckered },
  struktur: { label: "Kosten", icon: FaSitemap },
  kosten: { label: "Flächenterminplan", icon: FaSitemap },
  multiProzesse: { label: "6-Wochen Vorschau", icon: FaTasks },
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
  { name: "BALL Übergreifend", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=db4b5803-1637-49ef-9485-8eac238e450b", projectId: "db4b5803-1637-49ef-9485-8eac238e450b" },
  { name: "PFA Lübeck", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=e36ad9a3-9663-4427-aa93-60fda419f8ec", projectId: "e36ad9a3-9663-4427-aa93-60fda419f8ec" },
  { name: "PFA 3 NEU", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=bd710f48-8c38-457c-a295-96ae222f2d35", projectId: "bd710f48-8c38-457c-a295-96ae222f2d35" },
  { name: "PFA 1.2", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=bcb39e6f-31a8-4a09-919c-d9875b0e2d3d", projectId: "bcb39e6f-31a8-4a09-919c-d9875b0e2d3d" },
    { name: "PFA 1.1", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=471edc40-2715-4484-bb56-5342106687ff", projectId: "471edc40-2715-4484-bb56-5342106687ff" },
];

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3N2U3OGMyMC0yNmVhLTQ3OWQtYjIzMS00MGRkNzIxYWZiNDEiLCJlbWFpbCI6ImNocmlzdGlhbi5yZXV0ZXJAbGNtZGlnaXRhbC5jb20iLCJ0cyI6NjQ4LCJsaWMiOnsiZWRpdCI6MX0sImlhdCI6MTc0MTE4MzQ5Mn0.a42tshg1OH8gzYu0AsEaeymx8ebWOdNA2rZzz9rdd1c";

const fetchData = async () => {
  let projectData = {};
  for (const project of PROJECTS) {
    const response = await fetch(project.url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
    const blob = await response.blob();
    const data = await blob.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    projectData[project.name] = XLSX.utils.sheet_to_json(sheet);
  }
  return projectData;
};

const denseSelectStyles = {
  control: (base) => ({
    ...base,
    minHeight: 32,
    height: 32,
    backgroundColor: "#1a1a1a",
    borderColor: "#333",
  }),
  valueContainer: (base) => ({ ...base, padding: "0 6px" }),
  input: (base) => ({ ...base, margin: 0, padding: 0 }),
  indicatorsContainer: (base) => ({ ...base, height: 32 }),
  dropdownIndicator: (base) => ({ ...base, padding: 6 }),
  clearIndicator: (base) => ({ ...base, padding: 6 }),
  multiValue: (base) => ({ ...base, backgroundColor: "#00e0d6", color: "black" }),
  multiValueLabel: (base) => ({ ...base, color: "black", padding: "0 4px" }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#00e0d6" : "#1a1a1a",
    color: state.isFocused ? "black" : "white",
    padding: 8,
  }),
  menu: (base) => ({ ...base, backgroundColor: "#1a1a1a", zIndex: 9999 }),
  singleValue: (base) => ({ ...base, color: "white" }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState("multi");
  const [activeTab, setActiveTab] = useState("multiProzesse");

  const [selectedProjects, setSelectedProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0]?.name || "");
  const [selectedGewerke, setSelectedGewerke] = useState([]);
  const [selectedBereiche, setSelectedBereiche] = useState([]);
  const [selectedResponsibles, setSelectedResponsibles] = useState([]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    fetchData().then((fetchedData) => {
      setData(fetchedData);
      setLoading(false);
    });
  }, []);

  const availableTabs = mode === "multi"
    ? ["progress", "gantt", "tasks", "milestones", "multiProzesse"]
    : ["struktur", "kosten"];

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
    (mode === "multi" ? selectedProjects.length : (selectedProject ? 1 : 0)) +
    selectedGewerke.length + selectedBereiche.length + selectedResponsibles.length;

  const renderModule = () => {
    if (loading) return <p className="text-center text-gray-400 py-6">Lade Daten…</p>;

    if (mode === "multi") {
      const sharedProps = { data, projects: PROJECTS, selectedProjects };
      switch (activeTab) {
        case "progress": return <Fortschritt {...sharedProps} selectedBauleiterProjects={{}} />;
        case "gantt": return <GanttChart {...sharedProps} />;
        case "tasks": return <HeutigeAufgaben {...sharedProps} gewerkFilter={selectedGewerke} bereichFilter={selectedBereiche} />;
        case "milestones": return <Meilensteine {...sharedProps} gewerkFilter={selectedGewerke} bereichFilter={selectedBereiche} />;
        case "multiProzesse":
          return (
            <MultiProzesse
              data={data}
              projects={PROJECTS}
              selectedProjects={selectedProjects}
              gewerkFilter={selectedGewerke}
              bereichFilter={selectedBereiche}
              responsiblesFilter={selectedResponsibles}
            />
          );
        default: return null;
      }
    } else {
      const projectData = data[selectedProject] ? { [selectedProject]: data[selectedProject] } : {};
      const sharedProps = { data: projectData, projects: PROJECTS, selectedProject };
      switch (activeTab) {
        case "struktur": return <StrukturModul {...sharedProps} />;
        case "kosten": return <AuftragssummenModul {...sharedProps} />;
        default: return null;
      }
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen font-inter">
      {/* Sticky kompakte Top-Bar */}
      <div className="sticky top-0 z-50 bg-[#0d0d0d]/95 backdrop-blur border-b border-white/10">
        <div className="px-3 py-2 flex items-center gap-2">
          {/* Brand */}
          <div className="flex items-center gap-2 mr-2">
            <div className="h-6 sm:h-7 flex items-center">
  <Image src={Logo} alt="LCMD" className="h-full w-auto" priority />
</div>

            
          </div>

          {/* Mode-Switch (segmented) */}
          <div className="flex rounded-lg overflow-hidden border border-white/15 text-sm">
            <button
              onClick={() => { setMode("multi"); setActiveTab("multiProzesse"); }}
              className={`px-3 py-1.5 ${mode === "multi" ? "bg-[#00e0d6] text-black" : "bg-transparent text-white/80 hover:bg-white/10"}`}
              title="Mehrere Projekte vergleichen"
            >
              Mehrere
            </button>
            <button
              onClick={() => { setMode("single"); setActiveTab("struktur"); }}
              className={`px-3 py-1.5 ${mode === "single" ? "bg-[#00e0d6] text-black" : "bg-transparent text-white/80 hover:bg-white/10"}`}
              title="Ein Projekt analysieren"
            >
              Ein Projekt
            </button>
          </div>

          {/* Tabs (kompakt, scrollbar) */}
          <div className="flex-1 overflow-x-auto no-scrollbar">
            <div className="flex gap-1 px-2">
              {availableTabs.map((tab) => {
                const TabIcon = PROJECT_TABS[tab].icon;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap flex items-center gap-2 transition-colors ${
                      activeTab === tab ? "bg-[#00e0d6] text-black" : "bg-white/5 hover:bg-white/10 text-white"
                    }`}
                    title={PROJECT_TABS[tab].label}
                  >
                    <TabIcon /> <span className="hidden sm:inline">{PROJECT_TABS[tab].label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="relative px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm flex items-center gap-2"
            title="Filter ein-/ausblenden"
          >
            <FaSlidersH />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 text-[10px] bg-[#00e0d6] text-black rounded-full px-1.5 py-[2px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible Filterpanel */}
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="px-3 pb-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Projekte */}
                <div>
                  <div className="text-xs font-semibold mb-1 text-gray-400">
                    {mode === "multi" ? "Projekte vergleichen" : "Ein Projekt auswählen"}
                  </div>
                  {mode === "multi" ? (
                    <Select
                      isMulti
                      options={PROJECTS.map((p) => ({ label: p.name, value: p.name }))}
                      value={selectedProjects.map((name) => ({ label: name, value: name }))}
                      onChange={(selected) => setSelectedProjects(selected.map((s) => s.value))}
                      classNamePrefix="react-select"
                      className="text-black z-50"
                      styles={denseSelectStyles}
                      placeholder="Projekte…"
                      menuPortalTarget={typeof window !== "undefined" ? document.body : null}
                      menuPosition="fixed"
                    />
                  ) : (
                    <Select
                      options={PROJECTS.map((p) => ({ label: p.name, value: p.name }))}
                      value={{ label: selectedProject, value: selectedProject }}
                      onChange={(selected) => setSelectedProject(selected.value)}
                      classNamePrefix="react-select"
                      className="text-black z-50"
                      styles={denseSelectStyles}
                      placeholder="Projekt…"
                      menuPortalTarget={typeof window !== "undefined" ? document.body : null}
                      menuPosition="fixed"
                    />
                  )}
                </div>

                {/* Gewerke */}
                <div>
                  <div className="text-xs font-semibold mb-1 text-gray-400">Gewerke filtern</div>
                  <Select
                    isMulti
                    isSearchable
                    options={alleGewerke.map((g) => ({ value: g, label: g }))}
                    value={selectedGewerke.map((g) => ({ value: g, label: g }))}
                    onChange={(selected) => setSelectedGewerke(selected.map((s) => s.value))}
                    classNamePrefix="react-select"
                    className="text-black z-50"
                    styles={denseSelectStyles}
                    placeholder="Gewerke…"
                    menuPortalTarget={typeof window !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                  />
                </div>

                {/* Bereiche */}
                <div>
                  <div className="text-xs font-semibold mb-1 text-gray-400">Bereiche filtern</div>
                  <Select
                    isMulti
                    isSearchable
                    options={alleBereiche.map((b) => ({ value: b, label: b }))}
                    value={selectedBereiche.map((b) => ({ value: b, label: b }))}
                    onChange={(selected) => setSelectedBereiche(selected.map((s) => s.value))}
                    classNamePrefix="react-select"
                    className="text-black z-50"
                    styles={denseSelectStyles}
                    placeholder="Bereiche…"
                    menuPortalTarget={typeof window !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                  />
                </div>

                {/* Verantwortliche */}
                <div>
                  <div className="text-xs font-semibold mb-1 text-gray-400">Verantwortliche filtern</div>
                  <Select
                    isMulti
                    isSearchable
                    options={alleResponsibles.map((r) => ({ value: r, label: r }))}
                    value={selectedResponsibles.map((r) => ({ value: r, label: r }))}
                    onChange={(selected) => setSelectedResponsibles(selected.map((s) => s.value))}
                    classNamePrefix="react-select"
                    className="text-black z-50"
                    styles={denseSelectStyles}
                    placeholder="Verantwortliche…"
                    menuPortalTarget={typeof window !== "undefined" ? document.body : null}
                    menuPosition="fixed"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="px-3 pt-2">
        <div className="bg-[#1a1a1a] p-2 rounded-xl shadow w-full overflow-x-auto">
          {renderModule()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
