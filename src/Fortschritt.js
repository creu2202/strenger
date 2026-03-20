import React, { useState, useEffect, Component } from "react";
// import { ResponsiveBar } from "@nivo/bar";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Nivo Chart Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground border border-dashed rounded-lg p-4">
          Das Diagramm konnte nicht geladen werden. Bitte versuchen Sie, die Seite neu zu laden oder Filter zu ändern.
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table";
import { Badge } from "./components/ui/badge";

const excelDateToJSDate = (serial) => {
  if (!serial || isNaN(serial)) return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};

const getStatusBadge = (status) => {
  const statusConfig = {
    completed: {
      label: "Abgeschlossen",
      color: "bg-[#10b981]",
      text: "text-white",
    },
    overdue: {
      label: "Überfällig",
      color: "bg-[#ef4444]",
      text: "text-white",
    },
    delayed: {
      label: "Verspätet",
      color: "bg-[#f59e0b]",
      text: "text-white",
    },
    onTrack: {
      label: "Im Zeitplan",
      color: "bg-[#3b82f6]",
      text: "text-white",
    },
    planned: {
      label: "Geplant",
      color: "bg-[#6b7280]",
      text: "text-white",
    },
  };

  const config = statusConfig[status] || {
    label: status,
    color: "bg-slate-500",
    text: "text-white",
  };

  return (
    <Badge className={`${config.color} ${config.text} border-transparent shadow-sm`}>
      {config.label}
    </Badge>
  );
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

const SimpleBarChart = ({ data, keys, colors, onClick, margin }) => {
  const [hoveredBar, setHoveredBar] = useState(null);
  const containerRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = useState(1400);
  
  const barHeight = 60;
  const gap = 30;
  const labelWidth = 150;
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const width = containerWidth;
  const innerWidth = Math.max(width - labelWidth - margin.right, 100);
  const innerHeight = data.length * (barHeight + gap);

  const maxVal = Math.max(...data.map(d => keys.reduce((sum, key) => sum + d[key], 0)), 1);

  const translations = {
    completed: "Abgeschlossen",
    overdue: "Überfällig",
    delayed: "Verspätet",
    onTrack: "Im Zeitplan",
    planned: "Geplant"
  };

  return (
    <div className="w-full relative group/chart" ref={containerRef}>
      <div className="overflow-x-auto overflow-y-hidden pb-4">
        <svg 
          width={width} 
          height={Math.max(innerHeight + margin.top + margin.bottom, 200)} 
          viewBox={`0 0 ${width} ${Math.max(innerHeight + margin.top + margin.bottom, 200)}`} 
          className="drop-shadow-sm overflow-visible"
        >
          <g transform={`translate(${labelWidth},${margin.top})`}>
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <line
                key={p}
                x1={innerWidth * p}
                y1={0}
                x2={innerWidth * p}
                y2={innerHeight}
                stroke="hsl(var(--muted))"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.5"
              />
            ))}

            {data.map((d, i) => {
              let currentX = 0;
              const totalVal = keys.reduce((sum, key) => sum + d[key], 0);
              const activeKeys = keys.filter(k => d[k] > 0);
              
              return (
                <g key={d.project} transform={`translate(0, ${i * (barHeight + gap)})`} className="group/row">
                  {/* Projektname */}
                  <text
                    x={-12}
                    y={barHeight / 2}
                    dy=".35em"
                    textAnchor="end"
                    className="text-[13px] fill-muted-foreground font-medium group-hover/row:fill-foreground transition-colors font-inter"
                  >
                    {d.project.length > 20 ? d.project.substring(0, 17) + "..." : d.project}
                  </text>

                  {/* Hintergrund-Balken für besseres Hover-Gefühl */}
                  <rect
                    x={0}
                    y={-4}
                    width={innerWidth}
                    height={barHeight + 8}
                    fill="transparent"
                    className="pointer-events-none"
                  />

                  {/* Stapelbalken */}
                  {keys.map((key, j) => {
                    const val = d[key];
                    if (val === 0) return null;
                    const barWidth = (val / maxVal) * innerWidth;
                    
                    const isFirst = key === activeKeys[0];
                    const isLast = key === activeKeys[activeKeys.length - 1];
                    
                    // Erstelle Pfad für abgerundete Ecken (nur außen)
                    const radius = 6;
                    let pathData = "";
                    
                    if (isFirst && isLast) {
                      pathData = `M${currentX+radius},0 h${barWidth-2*radius} a${radius},${radius} 0 0 1 ${radius},${radius} v${barHeight-2*radius} a${radius},${radius} 0 0 1 -${radius},${radius} h-${barWidth-2*radius} a${radius},${radius} 0 0 1 -${radius},-${radius} v-${barHeight-2*radius} a${radius},${radius} 0 0 1 ${radius},-${radius} z`;
                    } else if (isFirst) {
                      pathData = `M${currentX+radius},0 h${barWidth-radius} v${barHeight} h-${barWidth-radius} a${radius},${radius} 0 0 1 -${radius},-${radius} v-${barHeight-2*radius} a${radius},${radius} 0 0 1 ${radius},-${radius} z`;
                    } else if (isLast) {
                      pathData = `M${currentX},0 h${barWidth-radius} a${radius},${radius} 0 0 1 ${radius},${radius} v${barHeight-2*radius} a${radius},${radius} 0 0 1 -${radius},${radius} h-${barWidth-radius} v-${barHeight} z`;
                    } else {
                      pathData = `M${currentX},0 h${barWidth} v${barHeight} h-${barWidth} z`;
                    }

                    const element = (
                      <path
                        key={key}
                        d={pathData}
                        fill={colors[j]}
                        className="cursor-pointer transition-all duration-200 hover:brightness-110"
                        onClick={() => onClick({ id: key, indexValue: d.project })}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredBar({
                            project: d.project,
                            label: translations[key] || key,
                            value: val,
                            color: colors[j],
                            x: rect.left + rect.width / 2,
                            y: rect.top
                          });
                        }}
                        onMouseLeave={() => setHoveredBar(null)}
                      />
                    );
                    currentX += barWidth;
                    return element;
                  })}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Custom Tooltip */}
        {hoveredBar && (
          <div 
            className="fixed z-[100] pointer-events-none bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-md border text-sm flex flex-col gap-1 -translate-x-1/2 -translate-y-[calc(100%+8px)] animate-in fade-in zoom-in duration-150"
            style={{ left: hoveredBar.x, top: hoveredBar.y }}
          >
            <span className="font-semibold border-b pb-1 mb-1">{hoveredBar.project}</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredBar.color }} />
              <span className="text-xs">{hoveredBar.label}: <span className="font-bold">{hoveredBar.value}</span></span>
            </div>
          </div>
        )}
      </div>
      
      {/* Legende */}
      <div className="flex flex-wrap gap-6 mt-2 px-4 justify-center py-4 bg-muted/30 rounded-xl border border-dashed">
        {keys.map((key, i) => (
          <div key={key} className="flex items-center gap-2 group/item cursor-default">
            <div 
              className="w-3 h-3 rounded-full transition-transform group-hover/item:scale-125" 
              style={{ backgroundColor: colors[i] }} 
            />
            <span className="text-[12px] font-medium text-muted-foreground group-hover/item:text-foreground transition-colors capitalize font-inter">
              {translations[key] || key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Fortschritt = ({ data, projects, selectedBauleiterProjects, selectedProjects, searchTerm, gewerkFilter, bereichFilter, responsiblesFilter }) => {
  if (!data || Object.keys(data).length === 0) return <p className="text-muted-foreground text-lg p-6">Keine Daten verfügbar...</p>;

  const today = new Date();
  const normalizedSearch = searchTerm?.toLowerCase().trim();
  const [selectedProcesses, setSelectedProcesses] = useState([]);
  const [bauleiterMapping, setBauleiterMapping] = useState({});

  useEffect(() => {
    const savedBauleiter = JSON.parse(localStorage.getItem("bauleiter")) || [];
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
    if (!Array.isArray(jsonData)) return;

    let completed = 0,
      overdue = 0,
      planned = 0,
      onTrack = 0,
      delayed = 0;

    jsonData.forEach((row, rowIdx) => {
      if (!row) return;

      // --- FILTERS ---
      const tradeName = (row["Trade"] || "Kein Gewerk").toString();
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

      const statusRaw = row["Status"];
      const progress = (statusRaw != null && statusRaw !== "") ? parseFloat(String(statusRaw).replace(",", ".")) * 100 : 0;
      const startDate = excelDateToJSDate(row["Start Date"]);
      const endDate = excelDateToJSDate(row["End Date"]);
      const durationRaw = row["Duration"];
      const duration = (durationRaw != null && durationRaw !== "") ? parseFloat(String(durationRaw).replace(",", ".")) : 1;

      if (!startDate || !endDate) return;

      const daysSinceStart = Math.max(
        0,
        Math.floor((today - startDate) / (1000 * 60 * 60 * 24))
      );
      const expectedProgress = (100 / (duration || 1)) * daysSinceStart;

      let category = "";
      if (progress >= 100) {
        completed++;
        category = "completed";
      } else if (endDate < today) {
        overdue++;
        category = "overdue";
      } else if (startDate <= today && endDate >= today) {
        if (progress >= expectedProgress) {
          onTrack++;
          category = "onTrack";
        } else {
          delayed++;
          category = "delayed";
        }
      } else if (startDate > today) {
        planned++;
        category = "planned";
      }

      if (!category) return; // Falls keine Kategorie matcht, nicht zu allProcesses hinzufügen

      const rowId = row["ID"] != null ? String(row["ID"]) : `row-${index}-${rowIdx}-${Math.random()}`;
      const processName = (row["Process"] || "Unbekannter Prozess").toString();

      if (normalizedSearch) {
        const hit = 
          projectName.toLowerCase().includes(normalizedSearch) ||
          processName.toLowerCase().includes(normalizedSearch) ||
          tradeName.toLowerCase().includes(normalizedSearch) ||
          rowId.toLowerCase().includes(normalizedSearch);
        
        if (!hit) return;
      }

      let assignedBauleiterId = Object.keys(selectedBauleiterProjects || {}).find(
        (bauleiterId) => selectedBauleiterProjects[bauleiterId] === projectName
      );
      let bauleiterName = assignedBauleiterId
        ? bauleiterMapping[assignedBauleiterId]?.name || "Nicht zugewiesen"
        : "Nicht zugewiesen";
      let bauleiterEmail = assignedBauleiterId
        ? bauleiterMapping[assignedBauleiterId]?.email || ""
        : "";

      const projectMeta = projects ? projects.find(p => p.name === projectName) : null;
      const projectId = projectMeta?.projectId || "";

      allProcesses.push({
        project: projectName,
        projectId: projectId,
        id: rowId,
        process: processName,
        trade: tradeName,
        startDate,
        endDate,
        status: category,
        progress: isFinite(progress) ? progress : 0,
        expectedProgress: isFinite(expectedProgress) ? expectedProgress : 0,
        bauleiter: bauleiterName,
        email: bauleiterEmail,
      });
    });

    projectData.push({
      project: projectName,
      completed: completed || 0,
      overdue: overdue || 0,
      delayed: delayed || 0,
      onTrack: onTrack || 0,
      planned: planned || 0,
    });
  });

  // WICHTIG: Sicherstellen, dass chartData absolut valide Zahlen enthält
  // und für jedes Projekt ALLE Keys vorhanden sind, um nivo/react-spring Fehler zu vermeiden.
  // Wir filtern Projekte ohne Namen oder ohne jegliche Daten aus.
  const chartData = projectData
    .filter(d => d && d.project && typeof d.project === 'string')
    .map(d => {
      const keys = ["completed", "overdue", "delayed", "onTrack", "planned"];
      const entry = { project: d.project };
      keys.forEach(key => {
        const val = Number(d[key]);
        entry[key] = isFinite(val) ? Math.max(0, val) : 0;
      });
      return entry;
    });

  // Falls chartData leer ist oder keine Projekte enthält, fangen wir das ab.
  if (!chartData || chartData.length === 0) {
    return (
      <div className="p-6 w-full space-y-6">
        <Card>
          <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
            Keine Daten für die gewählten Filter vorhanden.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 w-full space-y-6">
      <Card>
        <CardContent className="h-auto p-2 sm:p-6">
          <ErrorBoundary key={JSON.stringify(chartData)}>
            <SimpleBarChart
              data={chartData}
              keys={["completed", "overdue", "delayed", "onTrack", "planned"]}
              margin={{ top: 0, right: 20, bottom: 10, left: 0 }}
              colors={["#10b981", "#ef4444", "#f59e0b", "#3b82f6", "#6b7280"]}
              onClick={(bar) => {
                setSelectedProcesses(
                  allProcesses.filter(
                    (item) => item.status === bar.id && item.project === bar.indexValue
                  )
                );
              }}
            />
          </ErrorBoundary>
        </CardContent>
      </Card>

      {selectedProcesses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Prozesse ({selectedProcesses.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projekt</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Prozess</TableHead>
                  <TableHead>Startdatum</TableHead>
                  <TableHead>Enddatum</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedProcesses.map((process) => (
                  <TableRow
                    key={`${process.project}-${process.id}`}
                    className="cursor-pointer"
                    onClick={() => {
                      window.open(
                        `https://share.lcmdigital.com/?project=${process.projectId}&processid=${process.id}`,
                        "_blank"
                      );
                    }}
                  >
                    <TableCell className="font-medium">{process.project}</TableCell>
                    <TableCell>{process.id}</TableCell>
                    <TableCell>{process.process}</TableCell>
                    <TableCell>{process.startDate.toLocaleDateString()}</TableCell>
                    <TableCell>{process.endDate.toLocaleDateString()}</TableCell>
                    <TableCell>{getStatusBadge(process.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Fortschritt;
