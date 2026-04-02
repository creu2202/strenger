import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  ArrowUpRight, 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Users,
  Calendar,
  Layers,
  ExternalLink,
  List,
  LayoutGrid
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { cn } from "./components/ui/utils";

const Overview = ({ data, projects, onTabChange, onProjectSelect, onOpenInLCMD, selectedProjects, gewerkFilter, bereichFilter, responsiblesFilter, searchTerm }) => {
  const [viewMode, setViewMode] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("overview_viewMode") || "cards";
    }
    return "cards";
  });

  React.useEffect(() => {
    localStorage.setItem("overview_viewMode", viewMode);
  }, [viewMode]);
  
  const stats = useMemo(() => {
    if (!data) return null;
    const today = new Date();
    const normalizedSearch = searchTerm?.toLowerCase().trim();

    const RESPONSIBLE_KEYS = [
      "Responsibles", "Responsible", "Verantwortlich", "Verantwortliche", "Verantwortliche(r)"
    ];
    const parseResponsibles = (val) => {
      if (val == null && val !== 0) return [];
      if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
      const s = String(val);
      return s.split(/[\n,;\/|]+/g).map(t => t.trim()).filter(Boolean);
    };

    return projects.map(project => {
      const projectRows = data[project.name] || [];
      const projectNameMatch = normalizedSearch && project.name.toLowerCase().includes(normalizedSearch);
      
      const DURATION_KEYS = ["Duration", "Dauer", "Dauer [d]", "Duration (d)"];
      
      // Filter und Logik analog zu Meilensteine.js
      const processes = projectRows.filter((row) => {
        const processName = (row["Process"] || "").toString();
        const tradeName = (row["Trade"] || "").toString();
        const id = (row["ID"] || "").toString();

        // --- FILTERS (analog zu Meilensteine.js) ---
        if (gewerkFilter && gewerkFilter.length > 0 && !gewerkFilter.includes(tradeName)) {
          return false;
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
          if (!hasAreaMatch) return false;
        }

        if (responsiblesFilter && responsiblesFilter.length > 0) {
          const rowResponsibles = parseResponsibles(row.Responsibles ?? row.Responsible ?? row.Verantwortlich ?? row["Verantwortliche(r)"]);
          const hasRespMatch = rowResponsibles.some(r => responsiblesFilter.includes(r));
          if (!hasRespMatch) return false;
        }

        if (normalizedSearch && !projectNameMatch) {
          const hit = 
            processName.toLowerCase().includes(normalizedSearch) ||
            tradeName.toLowerCase().includes(normalizedSearch) ||
            id.toLowerCase().includes(normalizedSearch);
          
          if (!hit) return false;
        }
        return true;
      }).map((row) => {
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
        const start = parseDate(row["Start Date"]);
        const end = parseDate(row["End Date"]);
        const status = row["Status"];

        let durationDays = null;
        for (const k of DURATION_KEYS) {
          const v = row[k];
          if (v != null && v !== "") {
            const num = Number(String(v).replace(",", "."));
            if (isFinite(num)) { durationDays = Math.max(0, Math.round(num)); break; }
          }
        }
        if (durationDays == null) {
          if (start && end) {
            const diff = Math.round((new Date(end).setHours(0,0,0,0) - new Date(start).setHours(0,0,0,0)) / 86400000);
            durationDays = Math.max(0, diff + 1);
          } else {
            durationDays = 0;
          }
        }

        return { start, end, status, durationDays, row };
      }).filter(p => p.start && p.end);

      const startDates = processes.map(p => p.start);
      const endDates = processes.map(p => p.end);

      let avgProgress = 0;
      let totalProcesses = 0;
      let completedProcessesCount = 0;
      let overdueProcessesCount = 0;

      if (startDates.length > 0 && endDates.length > 0) {
        const projectStart = new Date(Math.min(...startDates));
        const projectEnd = new Date(Math.max(...endDates));
        const totalDuration = (projectEnd - projectStart) / (1000 * 60 * 60 * 24);
        const elapsedTime = (today - projectStart) / (1000 * 60 * 60 * 24);

        const pastProcesses = processes.filter((p) => p.end < today);
        const completedPastProcesses = pastProcesses.filter((p) => p.status === 1);

        const completionFactor = pastProcesses.length > 0 ? completedPastProcesses.length / pastProcesses.length : 0;
        const expectedProgress = totalDuration > 0 ? (elapsedTime / totalDuration) * 100 : 0;
        avgProgress = totalDuration > 0 ? (elapsedTime / totalDuration) * completionFactor * 100 : 0;
        avgProgress = Math.max(0, Math.min(100, avgProgress));

        totalProcesses = processes.length;
        completedProcessesCount = processes.filter(p => p.status === 1).length;
        
        // Überfällige Prozesse: Ende in der Vergangenheit und Status nicht abgeschlossen (1)
        overdueProcessesCount = processes.filter(p => p.end < today && p.status !== 1).length;

        // Meilensteine: Definition analog zu Meilensteine.js (durationDays === 0)
        const milestones = processes.filter(p => p.durationDays === 0);
        const completedMilestones = milestones.filter(m => m.status === 1).length;

        return {
          id: project.projectId,
          name: project.name,
          avgProgress: Math.round(avgProgress),
          expectedProgress: Math.round(Math.max(0, Math.min(100, expectedProgress))),
          totalProcesses,
          completedProcessesCount,
          overdueProcessesCount,
          milestonesCount: milestones.length,
          completedMilestones,
          lastUpdate: "Heute"
        };
      }
      
      if (normalizedSearch && !projectNameMatch) return null;

      return {
        id: project.projectId,
        name: project.name,
        avgProgress: 0,
        expectedProgress: 0,
        totalProcesses: 0,
        completedProcessesCount: 0,
        overdueProcessesCount: 0,
        milestonesCount: 0,
        completedMilestones: 0,
        lastUpdate: "Heute"
      };
    }).filter(Boolean);
  }, [data, projects, selectedProjects, gewerkFilter, bereichFilter, responsiblesFilter, searchTerm]);

  const totalStats = useMemo(() => {
    if (!stats || stats.length === 0) return null;
    return {
      totalProjects: stats.length,
      avgTotalProgress: Math.round(stats.reduce((acc, s) => acc + s.avgProgress, 0) / stats.length),
      avgExpectedProgress: Math.round(stats.reduce((acc, s) => acc + s.expectedProgress, 0) / stats.length),
      totalOverdueProcesses: stats.reduce((acc, s) => acc + s.overdueProcessesCount, 0),
      totalProcesses: stats.reduce((acc, s) => acc + s.totalProcesses, 0)
    };
  }, [stats]);

  if (!stats) return null;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Guten Morgen";
    if (hour < 18) return "Guten Tag";
    return "Guten Abend";
  };

  const getHealthStatus = (project) => {
    const progressDiff = project.avgProgress - project.expectedProgress;
    const overdueRatio = project.totalProcesses > 0 ? project.overdueProcessesCount / project.totalProcesses : 0;
    
    // Statuslogik basierend auf den Farben im Screenshot
    // Orange für Kritisch, Blau für Leicht Verzögert, Grün für Im Zeitplan

    // Fall 4: Kritischer Verzug (Hohe Differenz oder viele überfällige Prozesse) -> Orange im Screenshot
    if (progressDiff < -15 || overdueRatio > 0.15) {
      return { 
        label: "Kritisch verzögert", 
        color: "text-orange-500", 
        barColor: "bg-orange-500",
        bg: "bg-orange-500/10", 
        icon: Clock 
      };
    }

    // Fall 2: Projekt ist leicht verzögert -> Blau im Screenshot
    if (progressDiff < 0 || overdueRatio > 0) {
      return { 
        label: "Leicht verzögert", 
        color: "text-blue-500", 
        barColor: "bg-blue-600",
        bg: "bg-blue-500/10", 
        icon: AlertCircle 
      };
    }

    // Fall 1: Projekt ist im Zeitplan und keine überfälligen Prozesse -> Grün
    return { 
      label: "Im Zeitplan", 
      color: "text-emerald-500", 
      barColor: "bg-emerald-500",
      bg: "bg-emerald-500/10", 
      icon: CheckCircle2 
    };
  };

  return (
    <div className="p-6 space-y-10 max-w-[1600px] mx-auto bg-white min-h-screen">
      {/* Header Bereich */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">
            {getGreeting()}, Portfolio-Überblick
          </h2>
          <p className="text-slate-500 mt-1 text-base font-medium">
            Status-Check Ihrer aktiven Projekte am {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}.
          </p>
        </motion.div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 mr-2">
            <Button
              variant={viewMode === "cards" ? "white" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className={cn(
                "h-8 w-8 p-0 rounded-md transition-all",
                viewMode === "cards" ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-900"
              )}
              title="Kartenansicht"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "white" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className={cn(
                "h-8 w-8 p-0 rounded-md transition-all",
                viewMode === "list" ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-900"
              )}
              title="Listenansicht"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center px-4 py-2 bg-transparent text-slate-500">
            <Calendar className="mr-2 h-4 w-4 text-slate-400" />
            <span className="text-sm font-bold">{new Date().toLocaleDateString('de-DE')}</span>
          </div>
        </div>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
          {[
            { label: "AKTIVE PROJEKTE", value: totalStats.totalProjects, icon: Layers, color: "text-blue-600", bg: "bg-blue-50" },
            { 
              label: "PORTFOLIO FORTSCHRITT", 
              value: `${totalStats.avgTotalProgress}%`, 
              expectedValue: `${totalStats.avgExpectedProgress}%`,
              diff: totalStats.avgTotalProgress - totalStats.avgExpectedProgress,
              icon: BarChart3, 
              color: "text-emerald-600", 
              bg: "bg-emerald-50", 
              isProgress: true,
              onClick: () => onTabChange("gantt")
            },
            { 
              label: "OFFENE VERZÖGERUNGEN", 
              value: totalStats.totalOverdueProcesses, 
              icon: Clock, 
              color: "text-orange-600", 
              bg: "bg-orange-50",
              onClick: () => onProjectSelect(null, "progress", "overdue")
            },
          ].map((kpi, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Card 
              className={cn(
                "overflow-hidden border-none shadow-sm bg-white hover:shadow-md transition-all duration-300",
                kpi.onClick && "cursor-pointer hover:bg-slate-50/50"
              )}
              onClick={kpi.onClick}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <h3 className="text-4xl font-black text-slate-900 leading-none">{kpi.value}</h3>
                      {kpi.isProgress && (
                        <div className="flex flex-col gap-1 flex-1 max-w-[120px]">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">SOLL: {kpi.expectedValue}</span>
                            {kpi.diff !== undefined && (
                              <span className={cn(
                                "text-[10px] font-black",
                                kpi.diff >= 0 ? "text-emerald-500" : "text-red-500"
                              )}>
                                {kpi.diff > 0 ? `+${kpi.diff}%` : `${kpi.diff}%`}
                              </span>
                            )}
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                            <div 
                              className={cn(
                                "h-full transition-all duration-1000",
                                kpi.diff >= 0 ? "bg-emerald-500" : "bg-red-500"
                              )}
                              style={{ width: kpi.value }}
                            />
                            <div 
                              className="absolute top-0 h-full w-0.5 bg-slate-300 z-20"
                              style={{ left: kpi.expectedValue }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={cn("p-4 rounded-2xl", kpi.bg)}>
                    <kpi.icon className={cn("h-7 w-7", kpi.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Projekt-Kacheln */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold flex items-center gap-3 text-slate-800">
            <LayoutDashboard className="h-6 w-6 text-slate-700" />
            Projekt-Statusberichte
          </h3>
        </div>

      {viewMode === "cards" ? (
        <motion.div 
          key="cards-view"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8"
        >
          {stats.map((project) => {
            const health = getHealthStatus(project);
            const diff = project.avgProgress - project.expectedProgress;
            return (
              <motion.div key={project.id} variants={itemVariants}>
                <Card className="group relative h-full overflow-hidden border-slate-200/50 bg-white hover:border-slate-300 transition-all duration-300 shadow-sm hover:shadow-xl flex flex-col">
                  {/* Status Indicator Bar */}
                  <div className={cn("h-1.5 w-full", health.barColor)} />
                  
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <health.icon className={cn("h-3.5 w-3.5", health.color)} />
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest",
                            health.color
                          )}>{health.label}</span>
                        </div>
                        <CardTitle className="text-xl font-bold text-slate-900 leading-tight">
                          {project.name}
                        </CardTitle>
                        <Badge variant="secondary" className="font-mono text-[10px] bg-slate-100 text-slate-500 border-none">#{project.id.split('-')[0]}</Badge>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-lg border border-slate-100 hover:bg-slate-50 transition-all shadow-sm"
                        onClick={() => onOpenInLCMD ? onOpenInLCMD(project.name) : onProjectSelect ? onProjectSelect(project.name) : onTabChange("progress")}
                      >
                        <ExternalLink className="h-4 w-4 text-slate-600" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6 flex-grow">
                    {/* Progress Bar Section */}
                    <div className="space-y-3 cursor-pointer group/progress" onClick={() => onProjectSelect(project.name, "progress")}>
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover/progress:text-slate-600 transition-colors">AKTUELLER STAND</span>
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Soll: {project.expectedProgress}%</span>
                            {diff < 0 && (
                              <span className="text-[10px] font-bold text-red-500">{diff}%</span>
                            )}
                          </div>
                          <span className="text-3xl font-black text-slate-900 leading-none group-hover/progress:text-blue-600 transition-colors">{project.avgProgress}%</span>
                        </div>
                      </div>
                      <div className="relative h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${project.avgProgress}%` }}
                          transition={{ duration: 1.5, ease: "circOut" }}
                          className={cn(
                            "h-full rounded-full relative",
                            health.barColor
                          )}
                        />
                        {/* Soll-Indikator-Balken */}
                        <div 
                          className="absolute top-0 h-full w-0.5 bg-red-400/50 z-10"
                          style={{ left: `${project.expectedProgress}%` }}
                        />
                        {/* Wenn im Verzug, roter Bereich im Hintergrund */}
                        {diff < 0 && (
                          <div 
                            className="absolute top-0 h-full bg-red-100/30"
                            style={{ left: `${project.avgProgress}%`, width: `${Math.abs(diff)}%` }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 relative">
                      <div 
                        className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:bg-white hover:shadow-sm transition-all group/stat"
                        onClick={() => onProjectSelect ? onProjectSelect(project.name, "progress") : onTabChange("progress")}
                      >
                        <div className="flex items-center gap-2 text-slate-400 text-[9px] font-bold uppercase mb-2 group-hover/stat:text-slate-600 transition-colors">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Vorgänge</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-800">{project.completedProcessesCount}</span>
                          <span className="text-xs text-slate-400">/ {project.totalProcesses}</span>
                        </div>
                      </div>
                      <div 
                        className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:bg-white hover:shadow-sm transition-all group/stat"
                        onClick={() => onProjectSelect ? onProjectSelect(project.name, "milestones") : onTabChange("milestones")}
                      >
                        <div className="flex items-center gap-2 text-slate-400 text-[9px] font-bold uppercase mb-2 group-hover/stat:text-slate-600 transition-colors">
                          <AlertCircle className="h-3 w-3" />
                          <span>Meilensteine</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-800">{project.completedMilestones}</span>
                          <span className="text-xs text-slate-400">/ {project.milestonesCount}</span>
                        </div>
                      </div>

                      {project.overdueProcessesCount > 0 && (
                        <div 
                          className="bg-red-50 p-4 rounded-xl border border-red-100 cursor-pointer hover:bg-red-100/50 transition-all flex items-center justify-between col-span-2"
                          onClick={() => onProjectSelect ? onProjectSelect(project.name, "progress", "overdue") : onTabChange("progress")}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-100 rounded-lg">
                              <Clock className="h-4 w-4 text-red-600" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">ÜBERFÄLLIG</span>
                              <span className="text-sm font-bold text-red-700">Aktion erforderlich</span>
                            </div>
                          </div>
                          <div className="bg-red-600 text-white px-2.5 py-1 rounded-full text-xs font-black">
                            {project.overdueProcessesCount}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <Button 
                        variant="outline" 
                        className="w-full justify-between h-12 rounded-xl border-slate-200 hover:bg-slate-900 hover:text-white group/btn transition-all duration-300 font-bold"
                        onClick={() => onOpenInLCMD ? onOpenInLCMD(project.name) : onProjectSelect ? onProjectSelect(project.name) : onTabChange("multiProzesse")}
                      >
                        <span>Projekt-Details anzeigen</span>
                        <div className="flex items-center justify-center w-5 h-5">
                          <ArrowUpRight className="h-4 w-4 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                        </div>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <motion.div
          key="list-view"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Projektname</th>
                  <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Fortschritt</th>
                  <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Vorgänge</th>
                  <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Überfällig</th>
                  <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Meilensteine</th>
                  <th className="px-6 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">zum Projekt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.map((project) => {
                  const health = getHealthStatus(project);
                  const milestoneProgress = project.milestonesCount > 0 
                    ? (project.completedMilestones / project.milestonesCount) * 100 
                    : 0;
                  return (
                    <tr 
                      key={project.id || project.name} 
                      className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                      onClick={() => onProjectSelect(project.name)}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-2 h-10 rounded-full", health.barColor)} />
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{project.name}</div>
                            <div className="text-[11px] text-slate-400 font-medium">LCMD Projekt</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <Badge variant="outline" className={cn("font-bold text-[10px] px-2.5 py-0.5 rounded-full border-none", health.color, health.bg)}>
                          {health.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-5 min-w-[200px]">
                        <div 
                          className="flex items-center gap-3 cursor-pointer group/row-progress"
                          onClick={(e) => {
                            e.stopPropagation();
                            onProjectSelect(project.name, "progress");
                          }}
                        >
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                            <div 
                              className={cn("h-full rounded-full transition-all duration-1000", health.barColor)} 
                              style={{ width: `${project.avgProgress}%` }}
                            />
                          </div>
                          <span className="text-xs font-black text-slate-700 w-8 group-hover/row-progress:text-blue-600 transition-colors">{project.avgProgress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center font-bold text-slate-600">{project.totalProcesses}</td>
                      <td 
                        className="px-6 py-5 text-center cursor-pointer hover:bg-orange-100/50 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          onProjectSelect(project.name, "progress", "overdue");
                        }}
                      >
                        <span className={cn("font-black px-2 py-1 rounded-lg", project.overdueProcessesCount > 0 ? "bg-orange-50 text-orange-600" : "text-slate-400")}>
                          {project.overdueProcessesCount}
                        </span>
                      </td>
                      <td 
                        className="px-6 py-5 text-center cursor-pointer hover:bg-emerald-50/50 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          onProjectSelect(project.name, "milestones");
                        }}
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-bold text-slate-700">{project.completedMilestones} / {project.milestonesCount}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Status</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenInLCMD) {
                              onOpenInLCMD(project.name);
                            } else {
                              onProjectSelect(project.name);
                            }
                          }}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
      </div>

      {/* Quick Actions / Info */}
      <motion.div 
        variants={itemVariants} 
        initial="hidden" 
        animate="visible" 
        className="bg-slate-900 text-white p-10 rounded-3xl shadow-2xl relative overflow-hidden group border border-white/10"
      >
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-md">
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Dashboard Live</span>
            </div>
            <h4 className="text-3xl font-black tracking-tight leading-tight">Ihre zentrale Projektsteuerung</h4>
            <p className="text-slate-400 max-w-lg text-base">
              Synchronisiert mit Echtzeitdaten aus Ihren <span className="text-white font-bold">lcmd Projekten</span>. Planen Sie vorausschauend Ihre Ressourcen mit der integrierten 6-Wochen-Vorschau.
            </p>
          </div>
          <Button 
            className="bg-white text-slate-900 hover:bg-slate-800 hover:text-white px-8 py-6 text-lg font-black rounded-xl transition-all duration-500 hover:scale-105 shadow-xl" 
            onClick={() => onTabChange("multiProzesse")}
          >
            Zur 6-Wochen Vorschau
          </Button>
        </div>
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-96 w-96 bg-blue-500/10 rounded-full blur-[120px] group-hover:bg-blue-500/20 transition-all duration-700" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-80 w-80 bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 h-1 w-1/2 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-y-12" />
      </motion.div>
    </div>
  );
};

export default Overview;
