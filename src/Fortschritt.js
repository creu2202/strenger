import React, { useState, useEffect } from "react";
import { ResponsiveBar } from "@nivo/bar";

const excelDateToJSDate = (serial) => {
  if (!serial || isNaN(serial)) return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};

const Fortschritt = ({ data, projects, selectedBauleiterProjects, selectedProjects }) => {
  if (!data) return <p className="text-gray-400 text-lg">Keine Daten verfügbar...</p>;

  const today = new Date();
  const [selectedProcesses, setSelectedProcesses] = useState([]);
  const [bauleiterMapping, setBauleiterMapping] = useState({});

  useEffect(() => {
    const savedBauleiter = JSON.parse(localStorage.getItem("bauleiter")) || [];
    const savedZuweisungen = JSON.parse(localStorage.getItem("zuweisungen")) || {};
    const mapping = {};

    savedBauleiter.forEach((b) => {
      mapping[b.id] = {
        name: b.name,
        email: b.adresse,
      };
    });

    setBauleiterMapping(mapping);
  }, []);

  let projectData = [];
  let allProcesses = [];

  Object.keys(data).forEach((projectName, index) => {
    if (selectedProjects.length > 0 && !selectedProjects.includes(projectName)) {
      return;
    }

    const jsonData = data[projectName];
    let completed = 0,
      overdue = 0,
      planned = 0,
      onTrack = 0,
      delayed = 0;

    jsonData.forEach((row) => {
      const progress = parseFloat(row["Status"] || 0) * 100;
      const startDate = excelDateToJSDate(row["Start Date"]);
      const endDate = excelDateToJSDate(row["End Date"]);
      const duration = parseFloat(row["Duration"] || 1);

      if (!startDate || !endDate) return;

      const daysSinceStart = Math.max(
        0,
        Math.floor((today - startDate) / (1000 * 60 * 60 * 24))
      );
      const expectedProgress = (100 / duration) * daysSinceStart;

      let category = "";
      if (progress === 100) {
        completed++;
        category = "completed";
      } else if (progress === 0 && startDate > today) {
        planned++;
        category = "planned";
      } else if (endDate < today && progress < 100) {
        overdue++;
        category = "overdue";
      } else if (startDate < today && endDate > today) {
        if (progress >= expectedProgress) {
          onTrack++;
          category = "onTrack";
        } else {
          delayed++;
          category = "delayed";
        }
      }

      let assignedBauleiterId = Object.keys(selectedBauleiterProjects).find(
        (bauleiterId) => selectedBauleiterProjects[bauleiterId] === projectName
      );
      let bauleiterName = assignedBauleiterId
        ? bauleiterMapping[assignedBauleiterId]?.name || "Nicht zugewiesen"
        : "Nicht zugewiesen";
      let bauleiterEmail = assignedBauleiterId
        ? bauleiterMapping[assignedBauleiterId]?.email || ""
        : "";

      allProcesses.push({
        project: projectName,
        projectId: projects[index].projectId,
        id: row["ID"],
        process: row["Process"],
        trade: row["Trade"],
        startDate,
        endDate,
        status: category,
        progress,
        expectedProgress,
        bauleiter: bauleiterName,
        email: bauleiterEmail,
      });
    });

    projectData.push({
      project: projectName,
      completed,
      overdue,
      delayed,
      onTrack,
      planned,
    });
  });

  const handleChartClick = (bar) => {
    setSelectedProcesses(
      allProcesses.filter(
        (item) => item.status === bar.id && item.project === bar.indexValue
      )
    );
  };

  return (
    <div className="p-6 font-inter text-white w-full">
      <h2 className="text-3xl font-semibold mb-6">Projektfortschritt</h2>

      <div className="h-96">
        <ResponsiveBar
          data={projectData}
          keys={["completed", "overdue", "delayed", "onTrack", "planned"]}
          indexBy="project"
          margin={{ top: 50, right: 130, bottom: 50, left: 200 }}
          padding={0.3}
          layout="horizontal"
          colors={["#8884d8", "#ff6b6b", "#ffc75f", "#00d2d3", "#6c757d"]}
          borderRadius={5}
          onClick={handleChartClick}
          theme={{
            axis: { ticks: { text: { fill: "#ccc" } } },
            tooltip: { container: { background: "#1a1a1a", color: "#fff" } },
            labels: { text: { fill: "#fff" } },
          }}
        />
      </div>

      {selectedProcesses.length > 0 && (
        <div className="mt-6 p-4 bg-[#1a1a1a] rounded-lg">
          <h3 className="text-xl font-semibold mb-4">Prozesse ({selectedProcesses.length})</h3>
          <table className="w-full text-sm text-white border-collapse">
            <thead>
              <tr className="bg-[#262626]">
                <th className="p-2 text-left">Projekt</th>
                <th className="p-2 text-left">ID</th>
                <th className="p-2 text-left">Prozess</th>
                <th className="p-2 text-left">Startdatum</th>
                <th className="p-2 text-left">Enddatum</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {selectedProcesses.map((process) => (
                <tr
                  key={`${process.project}-${process.id}`}
                  className="hover:bg-[#2e2e2e] cursor-pointer"
                  onClick={() => {
                    window.open(
                      `https://share.lcmdigital.com/?project=${process.projectId}&processid=${process.id}`,
                      "_blank"
                    );
                  }}
                >
                  <td className="p-2">{process.project}</td>
                  <td className="p-2">{process.id}</td>
                  <td className="p-2">{process.process}</td>
                  <td className="p-2">{process.startDate.toLocaleDateString()}</td>
                  <td className="p-2">{process.endDate.toLocaleDateString()}</td>
                  <td className="p-2">{process.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Fortschritt;
