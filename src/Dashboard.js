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

const PROJECT_TABS = {
  progress: { label: "Fortschritt", icon: FaChartBar },
  gantt: { label: "Gantt", icon: FaCalendarAlt },
  tasks: { label: "Tasks", icon: FaTasks },
  milestones: { label: "Milestones", icon: FaFlagCheckered },
  struktur: { label: "Kosten", icon: FaSitemap },
  kosten: { label: "Flächenterminplan", icon: FaSitemap },
};

const PROJECTS = [
  { name: "202303_Pankow_Heinersdorf", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=d5880456-887e-4060-8aff-269d4c62215f" },
  { name: "Ladenburg 2", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=47384be7-297c-47a0-9f69-76a40aa98d84" },
  { name: "21901 Hanau IA", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=f3c0cf31-82f9-438e-8f50-00023a9d5016" },
  { name: "202012 Heilbronn Neckarbogen K3", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=1423d270-7005-4fc3-ab74-3a23315b6088" },
  { name: "02013 – Heilbronn Neckarbogen M7", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=7e69cb6c-98d0-4e2a-ad90-779b973e8ad0" },
  { name: "202119_Pfullingen", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=95932af3-ba35-47dd-b135-46e72b8b7265" },
  { name: "BS Neckartailfingen", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=1144bc09-9453-42a3-a62a-786186fb4eca" },
  { name: "Frickenhausen neu ", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=5a79ed65-48db-45f5-8b36-e3de06f53407" },
  { name: "202501 Reutlingen", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=e150ee2d-7349-4af9-8ab7-13b0fc884a67" },
  { name: "202402 – Kirchheim am Neckar", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=0dc7cfab-34b5-4ec3-9385-6e47a71e6998" },
  { name: "Pfungstadt Ost-West-Süd", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=0fb936f8-dd63-4322-898f-6e4757138e85" },
  { name: "21504 – Ditzingen MFH NEU", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=3e01325e-dcc1-4a5b-be93-68f4d094c9c7" },
  { name: "21506_Ditzingen REH", url: "https://lcmd-rest.azurewebsites.net/api/rest?pid=8967aa6e-a354-4d59-a159-35a3e9789e3b" },
];

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3N2U3OGMyMC0yNmVhLTQ3OWQtYjIzMS00MGRkNzIxYWZiNDEiLCJlbWFpbCI6ImNocmlzdGlhbi5yZXV0ZXJAbGNtZGlnaXRhbC5jb20iLCJ0cyI6NTk3LCJsaWMiOnsiZWRpdCI6MX0sImlhdCI6MTczMjg3MTE1NH0.Au3piiNYXkgU49fgccGGoqhXcJoll5lpNH3oVdmSiMs";

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

  useEffect(() => {
    fetchData().then((fetchedData) => {
      setData(fetchedData);
      setLoading(false);
    });
  }, []);

  const getAvailableTabs = mode === "multi" ? ["progress", "gantt", "tasks", "milestones"] : ["struktur", "kosten"];

  const renderModule = () => {
    if (loading) return <p className="text-center text-gray-400">Lade Daten...</p>;

    if (mode === "multi") {
      const sharedProps = { data, projects: PROJECTS, selectedProjects };
      switch (activeTab) {
        case "progress": return <Fortschritt {...sharedProps} selectedBauleiterProjects={{}} />;
        case "gantt": return <GanttChart {...sharedProps} />;
        case "tasks": return <HeutigeAufgaben {...sharedProps} />;
        case "milestones": return <Meilensteine {...sharedProps} />;
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
    <div className="bg-[#0d0d0d] text-white min-h-screen font-inter p-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10">
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

        <div className="flex gap-6 mb-6">
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

        <div className="flex flex-wrap gap-3 mb-6">
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

        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-2 text-gray-400">
            {mode === "multi" ? "Projekte vergleichen:" : "Ein Projekt auswählen:"}
          </h2>
          {mode === "multi" ? (
            <Select
              isMulti
              options={PROJECTS.map((p) => ({ label: p.name, value: p.name }))}
              value={selectedProjects.map((name) => ({ label: name, value: name }))}
              onChange={(selected) => setSelectedProjects(selected.map((s) => s.value))}
              className="text-black"
              classNamePrefix="react-select"
              placeholder="Projekte auswählen…"
              styles={{
                control: (base) => ({ ...base, backgroundColor: "#1a1a1a", borderColor: "#333", color: "white" }),
                menu: (base) => ({ ...base, backgroundColor: "#1a1a1a", color: "white" }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isFocused ? "#00e0d6" : "#1a1a1a",
                  color: state.isFocused ? "black" : "white",
                }),
                multiValue: (base) => ({ ...base, backgroundColor: "#00e0d6", color: "black" }),
                multiValueLabel: (base) => ({ ...base, color: "black" }),
              }}
            />
          ) : (
            <Select
              options={PROJECTS.map((p) => ({ label: p.name, value: p.name }))}
              value={{ label: selectedProject, value: selectedProject }}
              onChange={(selected) => setSelectedProject(selected.value)}
              className="text-black"
              classNamePrefix="react-select"
              placeholder="Projekt auswählen…"
              styles={{
                control: (base) => ({ ...base, backgroundColor: "#1a1a1a", borderColor: "#333", color: "white" }),
                menu: (base) => ({ ...base, backgroundColor: "#1a1a1a", color: "white" }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isFocused ? "#00e0d6" : "#1a1a1a",
                  color: state.isFocused ? "black" : "white",
                }),
                singleValue: (base) => ({ ...base, color: "white" }),
              }}
            />
          )}
        </div>

        <div className="bg-[#1a1a1a] p-6 rounded-xl shadow">
          {renderModule()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
