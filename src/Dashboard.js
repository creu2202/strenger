import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Select from "react-select";
import * as XLSX from "xlsx";
import Image from "next/image";
import Logo from "./lcmd_logo_white.svg";
import { FaChartBar, FaCalendarAlt, FaTasks, FaFlagCheckered, FaSitemap } from "react-icons/fa";
import Fortschritt from "./Fortschritt";
import GanttChart from "./GanttChart";
import HeutigeAufgaben from "./HeutigeAufgaben";
import Meilensteine from "./Meilensteine";
import StrukturModul from "./StrukturModul";
import AuftragssummenModul from "./AuftragssummenModul";
import ProzessGruppierungModul from "./ProzessGruppierungModul";
import GruppenGanttModul from "./GruppenGanttModul";



const PROJECT_TABS = {
  progress: { label: "Fortschritt", icon: FaChartBar },
  gantt: { label: "Gantt", icon: FaCalendarAlt },
  tasks: { label: "Tasks", icon: FaTasks },
  milestones: { label: "Milestones", icon: FaFlagCheckered },
  projectGroupGantt: { label: "Auslastung", icon: FaCalendarAlt },
  struktur: { label: "Kosten", icon: FaSitemap },
  kosten: { label: "Flächenterminplan", icon: FaSitemap },
};

const PROJECTS = [
  { name: "4254 - FGK - neu", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=69ec1f93-2994-4cc0-b0c2-c56919fbbe0d" },
  { name: "4253 - KETEK", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=050b84f7-507e-45b3-bff7-1cf9b15d7af1" },
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

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("multi");
  const [activeTab, setActiveTab] = useState("progress");
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0]?.name || "");
  const [selectedGewerke, setSelectedGewerke] = useState([]);

  useEffect(() => {
    fetchData().then((fetchedData) => {
      setData(fetchedData);
      setLoading(false);
    });
  }, []);

  const getAvailableTabs = mode === "multi"
  ? ["progress", "gantt", "tasks", "milestones", "projectGroupGantt"]
  : ["struktur", "kosten"];

  const alleGewerke = data
  ? [...new Set(
      Object.values(data)
        .flatMap((prozesse) => prozesse.map((p) => p.Trade?.trim()))
        .filter(Boolean)
    )].sort()
  : [];

  const renderModule = () => {
    if (loading) return <p className="text-center text-gray-400">Lade Daten...</p>;

    if (mode === "multi") {
      const sharedProps = { data, projects: PROJECTS, selectedProjects };
      switch (activeTab) {
        case "progress": return <Fortschritt {...sharedProps} selectedBauleiterProjects={{}} />;
        case "gantt": return <GanttChart {...sharedProps} />;
        case "tasks":
          return (
            <HeutigeAufgaben
              {...sharedProps}
              gewerkFilter={selectedGewerke}
            />
          );

        case "milestones": return <Meilensteine {...sharedProps} />;
        case "projectGroupGantt": return <GruppenGanttModul {...sharedProps} gewerkFilter={selectedGewerke} selectedProjects={selectedProjects}
      />
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
    <div className="bg-[#0d0d0d] text-white min-h-screen font-inter px-4 pt-4">
      <div className="w-full">
        <div className="flex justify-between items-center mb-4">
          <motion.h1
            className="text-4xl font-bold tracking-tight"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            Projekt-Dashboard
          </motion.h1>
          <Image src={Logo} alt="LCMD Logo" width={100} height={40} className="h-10 w-auto" />
        </div>

        <div className="flex gap-3 mb-4">
          <button
            onClick={() => {
              setMode("multi");
              setActiveTab("progress");
            }}
            className={`px-4 py-2 rounded font-medium ${mode === "multi" ? "bg-[#00e0d6] text-black" : "bg-[#333] text-white hover:bg-[#444]"}`}
          >
            🔀 Mehrere Projekte vergleichen
          </button>
          <button
            onClick={() => {
              setMode("single");
              setActiveTab("struktur");
            }}
            className={`px-4 py-2 rounded font-medium ${mode === "single" ? "bg-[#00e0d6] text-black" : "bg-[#333] text-white hover:bg-[#444]"}`}
          >
            🔎 Ein Projekt analysieren
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {getAvailableTabs.map((tab) => {
            const TabIcon = PROJECT_TABS[tab].icon;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-all duration-200 ${
                  activeTab === tab ? "bg-[#00e0d6] text-black" : "bg-[#333] hover:bg-[#444]"
                }`}
              >
                <TabIcon /> {PROJECT_TABS[tab].label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
  <div>
    <h2 className="text-sm font-semibold mb-2 text-gray-400">
      {mode === "multi" ? "Projekte vergleichen:" : "Ein Projekt auswählen:"}
    </h2>
    {mode === "multi" ? (
      <Select
        isMulti
        options={PROJECTS.map((p) => ({ label: p.name, value: p.name }))}
        value={selectedProjects.map((name) => ({ label: name, value: name }))}
        onChange={(selected) => setSelectedProjects(selected.map((s) => s.value))}
        className="text-black z-50"
        classNamePrefix="react-select"
        placeholder="Projekte auswählen…"
        styles={{
          control: (base) => ({ ...base, backgroundColor: "#1a1a1a", borderColor: "#333", color: "white" }),
          menu: (base) => ({ ...base, backgroundColor: "#1a1a1a", color: "white", zIndex: 9999 }),
          option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? "#00e0d6" : "#1a1a1a",
            color: state.isFocused ? "black" : "white",
          }),
          multiValue: (base) => ({ ...base, backgroundColor: "#00e0d6", color: "black" }),
          multiValueLabel: (base) => ({ ...base, color: "black" }),
          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        }}
        menuPortalTarget={typeof window !== "undefined" ? document.body : null}
        menuPosition="fixed"
      />
    ) : (
      <Select
        options={PROJECTS.map((p) => ({ label: p.name, value: p.name }))}
        value={{ label: selectedProject, value: selectedProject }}
        onChange={(selected) => setSelectedProject(selected.value)}
        className="text-black z-50"
        classNamePrefix="react-select"
        placeholder="Projekt auswählen…"
        styles={{
          control: (base) => ({ ...base, backgroundColor: "#1a1a1a", borderColor: "#333", color: "white" }),
          menu: (base) => ({ ...base, backgroundColor: "#1a1a1a", color: "white", zIndex: 9999 }),
          option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused ? "#00e0d6" : "#1a1a1a",
            color: state.isFocused ? "black" : "white",
          }),
          singleValue: (base) => ({ ...base, color: "white" }),
          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        }}
        menuPortalTarget={typeof window !== "undefined" ? document.body : null}
        menuPosition="fixed"
      />
    )}
  </div>

  <div>
  <h2 className="text-sm font-semibold mb-2 text-gray-400">Gewerke filtern:</h2>
<Select
  isMulti
  options={alleGewerke.map((g) => ({ value: g, label: g }))}
  value={selectedGewerke.map((g) => ({ value: g, label: g }))}
  onChange={(selected) => setSelectedGewerke(selected.map((s) => s.value))}
  isSearchable
  className="text-black z-50"
  classNamePrefix="react-select"
  placeholder="Gewerke auswählen…"
  styles={{
    control: (base) => ({ ...base, backgroundColor: "#1a1a1a", borderColor: "#333", color: "white" }),
    menu: (base) => ({ ...base, backgroundColor: "#1a1a1a", color: "white", zIndex: 9999 }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? "#00e0d6" : "#1a1a1a",
      color: state.isFocused ? "black" : "white",
    }),
    multiValue: (base) => ({ ...base, backgroundColor: "#00e0d6", color: "black" }),
    multiValueLabel: (base) => ({ ...base, color: "black" }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  }}
  menuPortalTarget={typeof window !== "undefined" ? document.body : null}
  menuPosition="fixed"
/>

  </div>
</div>



        <div className="bg-[#1a1a1a] p-2 rounded-xl shadow w-full overflow-x-auto">

          {renderModule()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
