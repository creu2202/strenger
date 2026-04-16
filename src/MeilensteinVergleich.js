import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  Search,
  EyeOff,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table";
import { cn } from "./components/ui/utils";

// ---------------------------------------------------------------------------
// Module-level helpers (pure functions, no side effects)
// ---------------------------------------------------------------------------

const DURATION_KEYS = ["Duration", "Dauer", "Dauer [d]", "Duration (d)"];

// Identical to parseDate in Dashboard.js / Meilensteine.js
const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) return val;
  const num = Number(val);
  if (!isNaN(num) && num > 40000) {
    const utc_days = Math.floor(num - 25569);
    return new Date(utc_days * 86400 * 1000);
  }
  const d = new Date(val);
  return isNaN(d) ? null : d;
};

// Returns { label, variant, delta }
// delta = days current is LATER than baseline (positive = delay)
const getMilestoneStatus = (currentDate, baselineISOString) => {
  if (!baselineISOString) {
    return { label: "Kein Basis", variant: "secondary", delta: null };
  }
  const baseline = new Date(baselineISOString);
  if (isNaN(baseline)) {
    return { label: "Kein Basis", variant: "secondary", delta: null };
  }
  const delta = Math.ceil(
    (currentDate.setHours(0, 0, 0, 0) - baseline.setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24)
  );
  if (delta <= 0) return { label: "Im Plan", variant: "success", delta };
  if (delta <= 7) return { label: "Leichte Verzögerung", variant: "warning", delta };
  return { label: "Kritisch", variant: "destructive", delta };
};

// Worst status across an array of status objects
const worstStatus = (statuses) => {
  if (statuses.some((s) => s.variant === "destructive")) return "destructive";
  if (statuses.some((s) => s.variant === "warning")) return "warning";
  if (statuses.some((s) => s.variant === "success")) return "success";
  return "secondary";
};

const formatDate = (d) => {
  if (!d) return "–";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return "–";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatusBadge = ({ status }) => (
  <Badge variant={status.variant} className="text-xs whitespace-nowrap">
    {status.label}
    {status.delta !== null && (
      <span className="ml-1 font-normal opacity-80">
        {status.delta > 0
          ? `+${status.delta}d`
          : status.delta === 0
          ? "±0d"
          : `${status.delta}d`}
      </span>
    )}
  </Badge>
);

const ProjectStatusIcon = ({ variant }) => {
  if (variant === "destructive")
    return <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />;
  if (variant === "warning")
    return <MinusCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />;
  if (variant === "success")
    return <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />;
  return <MinusCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const MeilensteinVergleich = ({
  data,
  projects,
  selectedProjects,
  searchTerm = "",
  gewerkFilter = [],
  bereichFilter = [],
  responsiblesFilter = [],
}) => {
  // Persist baselines: { [processId]: "YYYY-MM-DD" }
  const [baselines, setBaselines] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("milestone_baselines") || "{}");
    } catch {
      return {};
    }
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState("");
  // null = alle anzeigen | "success" | "warning" | "destructive"
  const [statusFilter, setStatusFilter] = useState(null);
  // { [projectName]: boolean } — defaults to expanded (true)
  const [expandedProjects, setExpandedProjects] = useState({});
  // Erledigte Meilensteine ausblenden (persistiert)
  const [hideCompleted, setHideCompleted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("mv_hideCompleted") === "true";
  });

  const toggleHideCompleted = () => {
    setHideCompleted((prev) => {
      const next = !prev;
      localStorage.setItem("mv_hideCompleted", String(next));
      return next;
    });
  };

  // ---- Derived: flat list of ALL milestones (ungefiltert, nur Datenbasis) ---
  const allMilestones = useMemo(() => {
    if (!data) return [];
    const result = [];

    Object.keys(data).forEach((projectName) => {
      const projectMeta = (projects || []).find((p) => p.name === projectName);
      if (!projectMeta) return;

      (data[projectName] || []).forEach((row) => {
        // Duration calculation — identical to Meilensteine.js lines 281-296
        let durationDays = null;
        for (const k of DURATION_KEYS) {
          const v = row[k];
          if (v != null && v !== "") {
            const num = Number(String(v).replace(",", "."));
            if (isFinite(num)) {
              durationDays = Math.max(0, Math.round(num));
              break;
            }
          }
        }
        const startDate = parseDate(row["Start Date"]);
        const endDate = parseDate(row["End Date"]);
        if (durationDays == null) {
          if (startDate && endDate) {
            const s = new Date(startDate);
            const e = new Date(endDate);
            const diff = Math.round(
              (e.setHours(0, 0, 0, 0) - s.setHours(0, 0, 0, 0)) / 86400000
            );
            durationDays = Math.max(0, diff + 1);
          } else {
            durationDays = 0;
          }
        }

        if (durationDays !== 0) return; // not a milestone
        if (!startDate) return;

        // Dashboard.js normalizes processId to key "Process Id" (with space)
        const processId = String(
          row["Process Id"] || row["ID"] || ""
        ).trim();
        if (!processId) return;

        const rawResp = row["Responsibles"] ?? row["Responsible"] ?? row["Verantwortlich"] ?? row["Verantwortliche"] ?? row["Verantwortliche(r)"] ?? "";
        const responsibles = Array.isArray(rawResp)
          ? rawResp.map(String).map((s) => s.trim()).filter(Boolean)
          : String(rawResp).split(/[\n,;\/|]+/g).map((t) => t.trim()).filter(Boolean);

        const processName = String(
          row["Process"] || row["ProcessName"] || row["Vorgang"] || row["Bezeichnung"] || row["Name"] || ""
        );

        result.push({
          processId,
          projectName,
          projectId: projectMeta.projectId,
          process: processName,
          trade: String(row["Trade"] || row["Gewerk"] || ""),
          bereich: String(row["Bereich"] || row["Area"] || ""),
          responsibles,
          currentDate: new Date(startDate),
          progress: typeof row["Status"] === "number" ? row["Status"] : 0,
        });
      });
    });

    // Sort: project name asc, then date asc
    result.sort((a, b) => {
      const pCmp = a.projectName.localeCompare(b.projectName, "de");
      return pCmp !== 0 ? pCmp : a.currentDate - b.currentDate;
    });

    return result;
  }, [data, projects]);

  // ---- Settings panel: unabhängig von allMilestones, direkt aus data ---
  const filteredMilestonesForSettings = useMemo(() => {
    if (!data) return [];
    const lower = settingsSearch.trim().toLowerCase();

    // Projekt-Filter: selectedProjects (Namen) → Set von projectIds
    const hasProjectFilter = Array.isArray(selectedProjects) && selectedProjects.length > 0;
    const allowedIds = hasProjectFilter
      ? new Set(
          selectedProjects
            .map((name) => (projects || []).find((p) => p.name === name)?.projectId)
            .filter(Boolean)
        )
      : null;

    const result = [];

    Object.keys(data).forEach((projectName) => {
      const rows = data[projectName] || [];
      const meta = (projects || []).find((p) => p.name === projectName);
      if (!meta) return;
      if (allowedIds && !allowedIds.has(meta.projectId)) return;

      rows.forEach((row) => {
        let dur = null;
        for (const k of DURATION_KEYS) {
          if (row[k] != null && row[k] !== "") {
            const n = Number(String(row[k]).replace(",", "."));
            if (isFinite(n)) { dur = Math.max(0, Math.round(n)); break; }
          }
        }
        const sd = parseDate(row["Start Date"]);
        const ed = parseDate(row["End Date"]);
        if (dur == null) {
          if (sd && ed) {
            dur = Math.max(0, Math.round((new Date(ed).setHours(0,0,0,0) - new Date(sd).setHours(0,0,0,0)) / 86400000) + 1);
          } else {
            dur = sd ? 0 : null;
          }
        }
        if (dur !== 0 || !sd) return;

        const pid = String(row["Process Id"] || row["ID"] || "").trim();
        if (!pid) return;

        const name = String(row["Process"] || row["ProcessName"] || row["Vorgang"] || row["Bezeichnung"] || row["Name"] || "");
        const trade = String(row["Trade"] || row["Gewerk"] || "");

        if (lower && !name.toLowerCase().includes(lower)) return;

        result.push({ processId: pid, projectName, projectId: meta.projectId, process: name, trade, currentDate: new Date(sd) });
      });
    });

    return result.sort((a, b) => {
      const p = a.projectName.localeCompare(b.projectName, "de");
      return p !== 0 ? p : a.currentDate - b.currentDate;
    });
  }, [data, projects, settingsSearch, selectedProjects]);

  // ---- Derived: grouped by project, with status per milestone --------------
  const _mainHasProjectFilter = Array.isArray(selectedProjects) && selectedProjects.length > 0;
  const _normalizedSelected = _mainHasProjectFilter ? selectedProjects.map((p) => p.trim()) : [];
  const milestonesByProject = (() => {
    const grouped = {};
    allMilestones.forEach((m) => {
      if (_mainHasProjectFilter && !_normalizedSelected.includes(m.projectName.trim())) return;
      if (!baselines[m.processId]) return;
      if (hideCompleted && m.progress >= 1) return;
      if (!grouped[m.projectName]) grouped[m.projectName] = [];
      const status = getMilestoneStatus(new Date(m.currentDate), baselines[m.processId]);
      grouped[m.projectName].push({ ...m, status });
    });
    return grouped;
  })();

  // ---- Derived: status-filtered view for main table -----------------------
  const visibleMilestonesByProject = (() => {
    if (!statusFilter) return milestonesByProject;
    const result = {};
    Object.entries(milestonesByProject).forEach(([projectName, milestones]) => {
      const filtered = milestones.filter((m) => m.status.variant === statusFilter);
      if (filtered.length > 0) result[projectName] = filtered;
    });
    return result;
  })();

  const allRows = Object.values(milestonesByProject).flat();
  const kpiStats = {
    total: allRows.length,
    onTrack: allRows.filter((m) => m.status.variant === "success").length,
    atRisk: allRows.filter((m) => m.status.variant === "warning").length,
    critical: allRows.filter((m) => m.status.variant === "destructive").length,
    pctOnTrack: (() => {
      const withBaseline = allRows.filter((m) => m.status.variant !== "secondary");
      return withBaseline.length > 0
        ? Math.round((allRows.filter((m) => m.status.variant === "success").length / withBaseline.length) * 100)
        : null;
    })(),
    withBaseline: allRows.filter((m) => m.status.variant !== "secondary").length,
  };

  const projectStatuses = (() => {
    const result = {};
    Object.entries(visibleMilestonesByProject).forEach(([projectName, milestones]) => {
      result[projectName] = worstStatus(milestones.map((m) => m.status));
    });
    return result;
  })();

  // ---- Handlers ------------------------------------------------------------
  const handleBaselineChange = (processId, isoValue) => {
    const updated = { ...baselines };
    if (isoValue) {
      updated[processId] = isoValue;
    } else {
      delete updated[processId];
    }
    setBaselines(updated);
    localStorage.setItem("milestone_baselines", JSON.stringify(updated));
  };

  const toggleProject = (projectName) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectName]: !(prev[projectName] ?? true),
    }));
  };

  const isExpanded = (projectName) => expandedProjects[projectName] ?? true;

  // ---- Loading guard -------------------------------------------------------
  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground py-16">
        Lade Daten…
      </div>
    );
  }

  // ---- Render --------------------------------------------------------------
  return (
    <div className="p-6 w-full space-y-6">
      {/* 1. PAGE HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Meilenstein-Vergleich
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Soll-/Ist-Vergleich der Meilensteine gegenüber Basisdaten
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={hideCompleted ? "default" : "outline"}
            size="sm"
            onClick={toggleHideCompleted}
            className="gap-2"
          >
            {hideCompleted ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {hideCompleted ? "Erledigte ausgeblendet" : "Erledigte eingeblendet"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen((v) => !v)}
            className="gap-2"
          >
            <Settings2 className="h-4 w-4" />
            Basisdaten pflegen
            {settingsOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {/* 2. KPI SUMMARY CARDS — klickbar als Filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Gesamt — setzt Filter zurück */}
        <button
          onClick={() => setStatusFilter(null)}
          className="text-left"
        >
          <Card className={cn(
            "transition-all",
            statusFilter === null
              ? "ring-2 ring-primary shadow-md"
              : "hover:shadow-md hover:border-primary/40 cursor-pointer"
          )}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{kpiStats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">Alle Meilensteine</p>
            </CardContent>
          </Card>
        </button>

        {/* Im Plan */}
        <button
          onClick={() => setStatusFilter(statusFilter === "success" ? null : "success")}
          className="text-left"
        >
          <Card className={cn(
            "transition-all",
            statusFilter === "success"
              ? "ring-2 ring-emerald-500 shadow-md"
              : "hover:shadow-md hover:border-emerald-300 cursor-pointer"
          )}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-emerald-500">{kpiStats.onTrack}</div>
              <p className="text-xs text-muted-foreground mt-1">Im Plan</p>
            </CardContent>
          </Card>
        </button>

        {/* Leichte Verzögerung */}
        <button
          onClick={() => setStatusFilter(statusFilter === "warning" ? null : "warning")}
          className="text-left"
        >
          <Card className={cn(
            "transition-all",
            statusFilter === "warning"
              ? "ring-2 ring-yellow-500 shadow-md"
              : "hover:shadow-md hover:border-yellow-300 cursor-pointer"
          )}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-yellow-500">{kpiStats.atRisk}</div>
              <p className="text-xs text-muted-foreground mt-1">Leichte Verzögerung</p>
            </CardContent>
          </Card>
        </button>

        {/* Kritisch */}
        <button
          onClick={() => setStatusFilter(statusFilter === "destructive" ? null : "destructive")}
          className="text-left"
        >
          <Card className={cn(
            "transition-all",
            statusFilter === "destructive"
              ? "ring-2 ring-red-500 shadow-md"
              : "hover:shadow-md hover:border-red-300 cursor-pointer"
          )}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-red-500">{kpiStats.critical}</div>
              <p className="text-xs text-muted-foreground mt-1">Kritisch (&gt;7 Tage)</p>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* 3. SETTINGS PANEL */}
      {settingsOpen && (
        <Card className="border-2 border-dashed border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              Basisdaten eintragen
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Ursprünglich geplantes Datum pro Meilenstein eintragen. Wird lokal gespeichert.
            </p>
          </CardHeader>
          <CardContent>
            {/* Search field directly above the table */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Meilenstein suchen…"
                  value={settingsSearch}
                  onChange={(e) => setSettingsSearch(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {filteredMilestonesForSettings.length < allMilestones.length && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {filteredMilestonesForSettings.length} von {allMilestones.length} Meilensteinen
                </span>
              )}
            </div>
            {filteredMilestonesForSettings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {allMilestones.length === 0
                  ? "Keine Meilensteine gefunden."
                  : "Keine Meilensteine entsprechen der aktuellen Suche / den aktiven Filtern."}
              </p>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projekt</TableHead>
                      <TableHead>Meilenstein</TableHead>
                      <TableHead>Gewerk</TableHead>
                      <TableHead>Aktuell geplant</TableHead>
                      <TableHead className="w-48">Basis-Datum setzen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMilestonesForSettings.map((m) => (
                      <TableRow key={`${m.projectName}__${m.processId}`}>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                          {m.projectName}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {m.process}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.trade || "–"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(m.currentDate)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={baselines[m.processId] || ""}
                            onChange={(e) =>
                              handleBaselineChange(m.processId, e.target.value)
                            }
                            className="h-8 text-sm w-40"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 4. MAIN VIEW — per project */}
      <div className="space-y-4">
        {Object.keys(visibleMilestonesByProject).length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {Object.keys(milestonesByProject).length === 0
                ? "Keine Meilensteine mit Basisdatum vorhanden."
                : "Keine Meilensteine für den aktiven Filter."}
            </CardContent>
          </Card>
        )}

        {Object.entries(visibleMilestonesByProject).map(
          ([projectName, milestones]) => {
            const projVariant = projectStatuses[projectName];
            const expanded = isExpanded(projectName);
            const criticalCount = milestones.filter(
              (m) => m.status.variant === "destructive"
            ).length;
            const warningCount = milestones.filter(
              (m) => m.status.variant === "warning"
            ).length;

            return (
              <Card
                key={projectName}
                className={cn(
                  "border-l-4",
                  projVariant === "destructive" && "border-l-red-500",
                  projVariant === "warning" && "border-l-yellow-500",
                  projVariant === "success" && "border-l-emerald-500",
                  projVariant === "secondary" && "border-l-gray-300"
                )}
              >
                {/* Project header — click to collapse */}
                <button
                  className="w-full text-left"
                  onClick={() => toggleProject(projectName)}
                >
                  <CardHeader className="pb-3 hover:bg-muted/30 transition-colors rounded-t-lg">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <ProjectStatusIcon variant={projVariant} />
                        <CardTitle className="text-base truncate">
                          {projectName}
                        </CardTitle>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {milestones.length}{" "}
                          {milestones.length !== 1
                            ? "Meilensteine"
                            : "Meilenstein"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {criticalCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {criticalCount} Kritisch
                          </Badge>
                        )}
                        {warningCount > 0 && (
                          <Badge variant="warning" className="text-xs">
                            {warningCount} Verzögert
                          </Badge>
                        )}
                        {expanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {/* Milestone table */}
                {expanded && (
                  <CardContent className="pt-0">
                    <div className="rounded-md border overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Meilenstein</TableHead>
                            <TableHead>Baseline-Datum</TableHead>
                            <TableHead>Aktuell geplant</TableHead>
                            <TableHead className="text-right">
                              Abweichung
                            </TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {milestones.map((m) => (
                            <TableRow
                              key={m.processId}
                              className={cn(
                                "cursor-pointer",
                                m.status.variant === "destructive" &&
                                  "bg-red-50/40 hover:bg-red-50",
                                m.status.variant === "warning" &&
                                  "bg-yellow-50/40 hover:bg-yellow-50"
                              )}
                              onClick={() => {
                                const url = `https://share.lcmdigital.com/?project=${m.projectId}&processid=${m.processId}`;
                                window.open(url, "_blank");
                              }}
                            >
                              <TableCell>
                                <span className="font-medium text-sm">
                                  {m.process}
                                </span>
                                {m.trade && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {m.trade}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {baselines[m.processId] ? (
                                  formatDate(new Date(baselines[m.processId]))
                                ) : (
                                  <span className="text-muted-foreground italic text-xs">
                                    nicht gesetzt
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(m.currentDate)}
                              </TableCell>
                              <TableCell className="text-right">
                                {m.status.delta !== null ? (
                                  <span
                                    className={cn(
                                      "font-mono text-sm font-semibold",
                                      m.status.delta > 7 && "text-red-600",
                                      m.status.delta > 0 &&
                                        m.status.delta <= 7 &&
                                        "text-yellow-600",
                                      m.status.delta <= 0 && "text-emerald-600"
                                    )}
                                  >
                                    {m.status.delta > 0
                                      ? `+${m.status.delta}d`
                                      : `${m.status.delta}d`}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    –
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <StatusBadge status={m.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          }
        )}
      </div>
    </div>
  );
};

export default MeilensteinVergleich;
