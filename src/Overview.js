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

const Overview = ({ data, projects, onTabChange, selectedProjects }) => {
  
  const stats = useMemo(() => {
    if (!data) return null;
    const today = new Date();

    return projects.map(project => {
      const projectRows = data[project.name] || [];
      
      // Filter und Logik analog zu GanttChart.js
      const processes = projectRows.map((row) => {
        const start = row["Start Date"] ? new Date(Math.floor(row["Start Date"] - 25569) * 86400 * 1000) : null;
        const end = row["End Date"] ? new Date(Math.floor(row["End Date"] - 25569) * 86400 * 1000) : null;
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
        avgProgress = totalDuration > 0 ? (elapsedTime / totalDuration) * completionFactor * 100 : 0;
        avgProgress = Math.max(0, Math.min(100, avgProgress));

        totalProcesses = processes.length;
        completedProcessesCount = processes.filter(p => p.status === 1).length;
        
        // Überfällige Prozesse: Ende in der Vergangenheit und Status nicht abgeschlossen (1)
        overdueProcessesCount = processes.filter(p => p.end < today && p.status !== 1).length;
      }
      
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
        totalProcesses,
        completedProcessesCount,
        overdueProcessesCount,
        milestonesCount: milestones.length,
        completedMilestones,
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

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      {/* Header Bereich */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Willkommen im Portfolio</h2>
          <p className="text-muted-foreground mt-1">
            Hier haben Sie den Überblick über alle aktiven Projekte und deren Status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1 text-sm font-medium border-primary/20 bg-primary/5">
            <Calendar className="mr-2 h-4 w-4" />
            {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </Badge>
        </div>
      </div>

      {/* Globale KPIs */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {[
          { label: "Projekte", value: totalStats.totalProjects, icon: Layers, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Ø Fortschritt", value: `${totalStats.avgTotalProgress}%`, icon: BarChart3, color: "text-emerald-600", bg: "bg-emerald-50", onClick: () => onTabChange("gantt") },
          { label: "Überfällige Vorgänge", value: totalStats.totalOverdueProcesses, icon: Clock, color: "text-orange-600", bg: "bg-orange-50", onClick: () => onTabChange("progress") },
        ].map((kpi, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Card 
              className={cn(
                "overflow-hidden border-none shadow-md hover:shadow-lg transition-all",
                kpi.onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              )}
              onClick={kpi.onClick}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                    <h3 className="text-3xl font-bold mt-1">{kpi.value}</h3>
                  </div>
                  <div className={`p-3 rounded-xl ${kpi.bg}`}>
                    <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Projekt-Kacheln */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5" />
            Projektübersicht
          </h3>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
        >
          {stats.map((project) => (
            <motion.div key={project.id} variants={itemVariants}>
              <Card className="group overflow-hidden border-border/50 hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-xl">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg group-hover:text-primary transition-colors cursor-pointer" onClick={() => onTabChange("progress")}>
                        {project.name}
                      </CardTitle>
                      <CardDescription>ID: {project.id.split('-')[0]}...</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onTabChange("progress")}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress Bar */}
                  <div className="space-y-2 cursor-pointer group/progress" onClick={() => onTabChange("gantt")}>
                    <div className="flex justify-between text-sm transition-colors group-hover/progress:text-primary">
                      <span className="text-muted-foreground">Gesamtfortschritt</span>
                      <span className="font-bold">{project.avgProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden transition-all group-hover/progress:h-3">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${project.avgProgress}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className={`h-full ${project.avgProgress > 80 ? 'bg-emerald-500' : project.avgProgress > 40 ? 'bg-blue-500' : 'bg-orange-500'}`}
                      />
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div 
                      className="bg-accent/50 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-accent hover:border-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                      onClick={() => onTabChange("progress")}
                    >
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Vorgänge</span>
                      </div>
                      <div className="text-sm font-semibold text-primary/80">
                        {project.completedProcessesCount} / {project.totalProcesses} <span className="text-xs font-normal text-muted-foreground ml-1">erledigt</span>
                      </div>
                    </div>
                    <div 
                      className="bg-accent/50 p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-accent hover:border-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                      onClick={() => onTabChange("milestones")}
                    >
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <AlertCircle className="h-3 w-3" />
                        <span>Meilensteine</span>
                      </div>
                      <div className="text-sm font-semibold text-primary/80">
                        {project.completedMilestones} / {project.milestonesCount} <span className="text-xs font-normal text-muted-foreground ml-1">erreicht</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => onTabChange("multiProzesse")}>
                      Details <ArrowUpRight className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Quick Actions / Info */}
      <motion.div variants={itemVariants} initial="hidden" animate="visible" className="bg-black text-white p-8 rounded-2xl shadow-xl relative overflow-hidden group">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2">
            <h4 className="text-2xl font-bold italic tracking-tighter">LCMD DIGITAL POWER</h4>
            <p className="text-zinc-400 max-w-md">
              Alle Projekte sind synchronisiert und auf dem neuesten Stand. Nutzen Sie die 6-Wochen Vorschau für detaillierte Ressourcenplanung.
            </p>
          </div>
          <Button className="bg-white text-black hover:bg-zinc-200 px-8 py-6 text-lg font-bold rounded-xl transition-transform hover:scale-105" onClick={() => onTabChange("multiProzesse")}>
            Zur 6-Wochen Vorschau
          </Button>
        </div>
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 bg-primary/20 rounded-full blur-[100px] group-hover:bg-primary/30 transition-colors" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 bg-blue-500/10 rounded-full blur-[100px]" />
      </motion.div>
    </div>
  );
};

export default Overview;
