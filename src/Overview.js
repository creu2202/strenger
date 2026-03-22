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
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { cn } from "./components/ui/utils";

const Overview = ({ data, projects, onTabChange, onProjectSelect, onOpenInLCMD, selectedProjects }) => {
  
  const stats = useMemo(() => {
    if (!data) return null;
    const today = new Date();

    return projects.map(project => {
      const projectRows = data[project.name] || [];
      
      // Filter und Logik analog zu GanttChart.js
      const processes = projectRows.map((row) => {
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
        return { start, end, status, row };
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

        // Meilensteine: Definition analog zu Meilensteine.js (Duration = 0)
        const milestones = processes.filter(({ start, end }) => {
          const diff = Math.round((end.setHours(0,0,0,0) - start.setHours(0,0,0,0)) / 86400000);
          return diff === 0;
        });
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
      
      return {
        id: project.projectId,
        name: project.name,
        avgProgress: Math.round(avgProgress),
        expectedProgress: 0,
        totalProcesses,
        completedProcessesCount,
        overdueProcessesCount,
        milestonesCount: 0,
        completedMilestones: 0,
        lastUpdate: "Heute"
      };
    });
  }, [data, projects]);

  const totalStats = useMemo(() => {
    if (!stats || stats.length === 0) return null;
    return {
      totalProjects: stats.length,
      avgTotalProgress: Math.round(stats.reduce((acc, s) => acc + s.avgProgress, 0) / stats.length),
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
    const diff = project.avgProgress - project.expectedProgress;
    if (diff >= 0) return { label: "Im Zeitplan", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle2 };
    if (diff >= -10) return { label: "Leicht verzögert", color: "text-blue-500", bg: "bg-blue-500/10", icon: AlertCircle };
    return { label: "Kritisch verzögert", color: "text-orange-500", bg: "bg-orange-500/10", icon: Clock };
  };

  return (
    <div className="p-6 space-y-10 max-w-[1600px] mx-auto bg-slate-50/30 min-h-screen">
      {/* Header Bereich */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
            {getGreeting()}, Portfolio-Überblick
          </h2>
          <p className="text-muted-foreground mt-2 text-lg">
            Status-Check Ihrer aktiven Projekte am {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}.
          </p>
        </motion.div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-4 py-2 text-sm font-semibold border-primary/20 bg-white/50 backdrop-blur-sm shadow-sm">
            <Calendar className="mr-2 h-4 w-4 text-primary" />
            {new Date().toLocaleDateString('de-DE')}
          </Badge>
        </div>
      </div>

      {/* Globale KPIs */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {[
          { label: "Aktive Projekte", value: totalStats.totalProjects, icon: Layers, color: "from-blue-600 to-indigo-600", bg: "bg-blue-500/10" },
          { label: "Portfolio Fortschritt", value: `${totalStats.avgTotalProgress}%`, icon: BarChart3, color: "from-emerald-600 to-teal-600", bg: "bg-emerald-500/10", onClick: () => onProjectSelect ? onProjectSelect(null, "gantt") : onTabChange("gantt") },
          { label: "Offene Verzögerungen", value: totalStats.totalOverdueProcesses, icon: Clock, color: "from-orange-500 to-red-600", bg: "bg-orange-500/10", onClick: () => onProjectSelect ? onProjectSelect(null, "progress", "overdue") : onTabChange("progress") },
        ].map((kpi, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Card 
              className={cn(
                "relative overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-500 group",
                kpi.onClick && "cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
              )}
              onClick={kpi.onClick}
            >
              <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br", kpi.color)} />
              <CardContent className="p-8 relative z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-muted-foreground group-hover:text-white/80 transition-colors uppercase tracking-wider">{kpi.label}</p>
                    <h3 className="text-4xl font-black mt-2 group-hover:text-white transition-colors">{kpi.value}</h3>
                  </div>
                  <div className={cn("p-4 rounded-2xl transition-all duration-500 group-hover:bg-white/20 group-hover:scale-110", kpi.bg)}>
                    <kpi.icon className={cn("h-8 w-8 transition-colors group-hover:text-white", kpi.color.split(' ')[0].replace('from-', 'text-'))} />
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
            <div className="p-2 bg-primary/10 rounded-lg">
              <LayoutDashboard className="h-6 w-6 text-primary" />
            </div>
            Projekt-Statusberichte
          </h3>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8"
        >
          {stats.map((project) => {
            const health = getHealthStatus(project);
            return (
              <motion.div key={project.id} variants={itemVariants}>
                <Card className="group relative h-full overflow-hidden border-slate-200/60 bg-white/80 backdrop-blur-md hover:border-primary/40 transition-all duration-500 shadow-sm hover:shadow-2xl flex flex-col">
                  {/* Status Indicator Bar */}
                  <div className={cn("h-1.5 w-full", health.color.replace('text-', 'bg-'))} />
                  
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <health.icon className={cn("h-4 w-4", health.color)} />
                          <span className={cn("text-[10px] font-black uppercase tracking-widest", health.color)}>{health.label}</span>
                        </div>
                        <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors cursor-pointer leading-tight" onClick={() => onProjectSelect ? onProjectSelect(project.name, "progress") : onTabChange("progress")}>
                          {project.name}
                        </CardTitle>
                        <Badge variant="secondary" className="font-mono text-[10px] bg-slate-100 text-slate-500 border-none">#{project.id.split('-')[0]}</Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary transition-all shadow-sm" onClick={() => onOpenInLCMD ? onOpenInLCMD(project.name) : onProjectSelect ? onProjectSelect(project.name) : onTabChange("progress")}>
                        <ExternalLink className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6 flex-grow">
                    {/* Progress Bar Section */}
                    <div className="space-y-3 cursor-pointer group/progress" onClick={() => onProjectSelect ? onProjectSelect(project.name, "progress") : onTabChange("progress")}>
                      <div className="flex justify-between items-end transition-colors group-hover/progress:text-primary">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Aktueller Stand</span>
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-slate-400 font-medium">Soll: {project.expectedProgress}%</span>
                          <span className="text-2xl font-black leading-none">{project.avgProgress}%</span>
                        </div>
                      </div>
                      <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${project.avgProgress}%` }}
                          transition={{ duration: 1.5, ease: "circOut" }}
                          className={cn(
                            "h-full rounded-full relative",
                            project.avgProgress >= project.expectedProgress - 10 
                              ? (project.avgProgress > 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-blue-400 to-indigo-600') 
                              : 'bg-gradient-to-r from-orange-400 to-red-600'
                          )}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </motion.div>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div 
                        className="bg-slate-50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:bg-white hover:border-primary/20 hover:shadow-md transition-all group/stat"
                        onClick={() => onProjectSelect ? onProjectSelect(project.name, "progress") : onTabChange("progress")}
                      >
                        <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase mb-2 group-hover/stat:text-primary transition-colors">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Vorgänge</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-800">{project.completedProcessesCount}</span>
                          <span className="text-xs text-slate-400">/ {project.totalProcesses}</span>
                        </div>
                      </div>
                      <div 
                        className="bg-slate-50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:bg-white hover:border-primary/20 hover:shadow-md transition-all group/stat"
                        onClick={() => onProjectSelect ? onProjectSelect(project.name, "milestones") : onTabChange("milestones")}
                      >
                        <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase mb-2 group-hover/stat:text-primary transition-colors">
                          <AlertCircle className="h-3 w-3" />
                          <span>Meilensteine</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-800">{project.completedMilestones}</span>
                          <span className="text-xs text-slate-400">/ {project.milestonesCount}</span>
                        </div>
                      </div>
                    </div>

                    {project.overdueProcessesCount > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-red-50/50 p-4 rounded-xl border border-red-100 cursor-pointer hover:bg-red-50 transition-all flex items-center justify-between group/overdue ring-1 ring-red-200/50"
                        onClick={() => onProjectSelect ? onProjectSelect(project.name, "progress", "overdue") : onTabChange("progress")}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-red-100 rounded-lg group-hover/overdue:bg-red-200 transition-colors">
                            <Clock className="h-4 w-4 text-red-600 animate-pulse" />
                          </div>
                          <div>
                            <span className="block text-[10px] font-black text-red-800 uppercase leading-none mb-1">Überfällig</span>
                            <span className="text-sm font-bold text-red-700">Aktion erforderlich</span>
                          </div>
                        </div>
                        <Badge className="bg-red-600 hover:bg-red-700 h-7 w-7 flex items-center justify-center rounded-full p-0 font-black shadow-lg shadow-red-200">
                          {project.overdueProcessesCount}
                        </Badge>
                      </motion.div>
                    )}

                    <div className="pt-2">
                      <Button 
                        variant="outline" 
                        className="w-full justify-between h-12 rounded-xl border-slate-200 hover:bg-slate-900 hover:text-white group/btn transition-all duration-300 font-bold"
                        onClick={() => onOpenInLCMD ? onOpenInLCMD(project.name) : onProjectSelect ? onProjectSelect(project.name) : onTabChange("multiProzesse")}
                      >
                        <span>Projekt-Details anzeigen</span>
                        <ArrowUpRight className="h-4 w-4 group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Quick Actions / Info */}
      <motion.div 
        variants={itemVariants} 
        initial="hidden" 
        animate="visible" 
        className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border border-white/10"
      >
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/20 border border-primary/30 backdrop-blur-md">
              <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Dashboard Live</span>
            </div>
            <h4 className="text-4xl font-black tracking-tight leading-tight">Ihre zentrale Projektsteuerung</h4>
            <p className="text-slate-400 max-w-lg text-lg">
              Synchronisiert mit Echtzeitdaten aus <span className="text-white font-bold">LCMD digital</span>. Planen Sie vorausschauend mit der integrierten 6-Wochen-Vorschau.
            </p>
          </div>
          <Button 
            className="bg-white text-slate-900 hover:bg-primary hover:text-white px-10 py-8 text-xl font-black rounded-2xl transition-all duration-500 hover:scale-105 shadow-xl hover:shadow-primary/20" 
            onClick={() => onTabChange("multiProzesse")}
          >
            Zur 6-Wochen Vorschau
          </Button>
        </div>
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-96 w-96 bg-primary/20 rounded-full blur-[120px] group-hover:bg-primary/30 transition-all duration-700" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-80 w-80 bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 h-1 w-1/2 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-y-12" />
      </motion.div>
    </div>
  );
};

export default Overview;
