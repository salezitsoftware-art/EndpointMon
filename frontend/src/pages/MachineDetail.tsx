import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getMachine, getMachineHistory, analyzeMachine, getMachineAnalyses } from "../api";
import type { MachineDetail as MachineDetailType, TelemetryPoint, MachineAnalysisRecord, MachineAnalysisResult } from "../types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

function formatValue(value: number | string | boolean | null | undefined) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
    return `${value}`;
  }
  return String(value);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  let s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s + "Z";
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  let s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s + "Z";
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function metricValue(metrics: Record<string, number | string | boolean | null> | null, keys: string[]) {
  if (!metrics) return null;
  for (const key of keys) {
    if (metrics[key] !== undefined && metrics[key] !== null) return metrics[key];
  }
  return null;
}

function buildLocalDayRange(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return null;
  const start = new Date(year, month - 1, date, 0, 0, 0, 0);
  const end = new Date(year, month - 1, date + 1, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    createdAfter: start.toISOString(),
    createdBefore: end.toISOString(),
  };
}

function getTodayLocalInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function MetricCard({
  label,
  value,
  glowColor,
  icon,
  peakValue,
  progress,
}: {
  label: string;
  value: string;
  glowColor: "indigo" | "amber" | "violet" | "rose";
  icon: string;
  peakValue?: string;
  progress?: number;
}) {
  const glowStyles = {
    indigo: "border-indigo-100 bg-white/90 shadow-indigo-100/40 hover:shadow-indigo-300/30 hover:border-indigo-300 shadow-md",
    amber: "border-amber-100 bg-white/90 shadow-amber-100/40 hover:shadow-amber-400/30 hover:border-amber-300 shadow-md",
    violet: "border-violet-100 bg-white/90 shadow-violet-100/40 hover:shadow-violet-400/30 hover:border-violet-300 shadow-md",
    rose: "border-rose-100 bg-white/90 shadow-rose-100/40 hover:shadow-rose-400/30 hover:border-rose-300 shadow-md",
  };

  const textColors = {
    indigo: "text-indigo-600",
    amber: "text-amber-600",
    violet: "text-violet-600",
    rose: "text-rose-600",
  };

  const bgColors = {
    indigo: "bg-indigo-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
    rose: "bg-rose-500",
  };

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-300 backdrop-blur-sm ${glowStyles[glowColor]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-3xl font-extrabold tracking-tight text-ink">{value}</span>
        {peakValue && (
          <span className="text-xs font-medium text-slate-400">
            peak: <span className="font-semibold text-slate-700">{peakValue}</span>
          </span>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-4">
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${bgColors[glowColor]}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MachineDetailPage() {
  const { machineId } = useParams();
  const id = Number(machineId);
  const telemetryLimit = 200;
  const analysisLimit = 200;
  const [selectedDay, setSelectedDay] = useState("");
  const [machine, setMachine] = useState<MachineDetailType | null>(null);
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [analysis, setAnalysis] = useState<MachineAnalysisResult | null>(null);
  const [analyses, setAnalyses] = useState<MachineAnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Tab state: "cockpit" (Cockpit & Inventory) or "history" (Performance History & AI Logs)
  const [activeTab, setActiveTab] = useState<"cockpit" | "history">("cockpit");
  const [heartbeat, setHeartbeat] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const historyRange = useMemo(() => {
    if (!selectedDay) return null;
    return buildLocalDayRange(selectedDay);
  }, [selectedDay]);

  const historyFetchLimit = historyRange ? 1000 : telemetryLimit;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [machineResp, historyResp, analysesResp] = await Promise.all([
          getMachine(id),
          getMachineHistory(id, {
            limit: historyFetchLimit,
            createdAfter: historyRange?.createdAfter,
            createdBefore: historyRange?.createdBefore,
          }),
          getMachineAnalyses(id)
        ]);
        if (cancelled) return;
        setMachine(machineResp);
        setHistory(historyResp);
        setAnalyses(analysesResp || []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load machine details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    // 1-second telemetry cockpit polling
    const intervalId = setInterval(async () => {
      try {
        const [machineResp, historyResp] = await Promise.all([
          getMachine(id),
          getMachineHistory(id, {
            limit: historyFetchLimit,
            createdAfter: historyRange?.createdAfter,
            createdBefore: historyRange?.createdBefore,
          })
        ]);
        if (cancelled) return;
        setMachine(machineResp);
        setHistory(historyResp);

        // Flash green heartbeat indicator
        setHeartbeat(true);
        const timer = setTimeout(() => setHeartbeat(false), 200);
        return () => clearTimeout(timer);
      } catch (e) {
        // Suppress background poll errors to prevent breaking the UI
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [id, historyFetchLimit, historyRange]);

  const latestMetrics = machine?.latest_metrics ?? null;

  // Calculate live peaks from history array
  const peaks = useMemo(() => {
    if (history.length === 0) return { cpu: 0, ram: 0, gpu: 0, latency: 0 };
    const cpuVals = history.map((h) => Number(metricValue(h.metrics, ["cpu", "cpu_percent", "cpu_usage"])) || 0);
    const ramVals = history.map((h) => Number(metricValue(h.metrics, ["ram", "memory", "memory_percent", "ram_usage"])) || 0);
    const gpuVals = history.map((h) => Number(metricValue(h.metrics, ["gpu", "gpu_percent", "gpu_usage"])) || 0);
    const latencyVals = history.map((h) => Number(metricValue(h.metrics, ["latency_ms", "latency"])) || 0);
    return {
      cpu: Math.max(...cpuVals),
      ram: Math.max(...ramVals),
      gpu: Math.max(...gpuVals),
      latency: Math.max(...latencyVals),
    };
  }, [history]);

  const usageCards = useMemo(() => {
    const cpu = Number(metricValue(latestMetrics, ["cpu", "cpu_percent", "cpu_usage"])) || 0;
    const ram = Number(metricValue(latestMetrics, ["ram", "memory", "memory_percent", "ram_usage"])) || 0;
    const gpu = Number(metricValue(latestMetrics, ["gpu", "gpu_percent", "gpu_usage"])) || 0;
    const latency = Number(metricValue(latestMetrics, ["latency_ms", "latency"])) || 0;

    return [
      {
        label: "CPU Usage",
        value: `${formatValue(cpu)}%`,
        glowColor: "indigo" as const,
        icon: "💻",
        peak: `${peaks.cpu}%`,
        progress: cpu,
      },
      {
        label: "RAM Usage",
        value: `${formatValue(ram)}%`,
        glowColor: "amber" as const,
        icon: "⚡",
        peak: `${peaks.ram}%`,
        progress: ram,
      },
      {
        label: "GPU Usage",
        value: `${formatValue(gpu)}%`,
        glowColor: "violet" as const,
        icon: "🎮",
        peak: `${peaks.gpu}%`,
        progress: gpu,
      },
      {
        label: "Network Latency",
        value: `${formatValue(latency)} ms`,
        glowColor: "rose" as const,
        icon: "🌐",
        peak: `${peaks.latency} ms`,
        progress: Math.min(100, (latency / 300) * 100),
      },
    ];
  }, [latestMetrics, peaks]);

  const chartData = useMemo(() => {
    return history.map((h) => {
      const cpu = Number(metricValue(h.metrics, ["cpu", "cpu_percent", "cpu_usage"])) || 0;
      const ram = Number(metricValue(h.metrics, ["ram", "memory_percent", "ram_usage"])) || 0;
      const latency = Number(metricValue(h.metrics, ["latency_ms", "latency"])) || 0;
      const d = parseTimestamp(h.created_at);
      const timeLabel = d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : String(h.created_at);
      return { time: timeLabel, cpu, ram, latency };
    });
  }, [history]);

  const [showCpu, setShowCpu] = useState(true);
  const [showRam, setShowRam] = useState(true);
  const [showLatency, setShowLatency] = useState(true);
  const [smoothing, setSmoothing] = useState(false);
  const [smoothingWindow, setSmoothingWindow] = useState(3);

  function movingAverage(values: number[], window: number) {
    if (window <= 1) return values.slice();
    const out: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = values.slice(start, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      out.push(sum / slice.length);
    }
    return out;
  }

  const processedChartData = useMemo(() => {
    if (!smoothing) return chartData;
    const cpuVals = chartData.map((d) => d.cpu);
    const ramVals = chartData.map((d) => d.ram);
    const latVals = chartData.map((d) => d.latency);
    const cpuSm = movingAverage(cpuVals, smoothingWindow);
    const ramSm = movingAverage(ramVals, smoothingWindow);
    const latSm = movingAverage(latVals, smoothingWindow);
    return chartData.map((d, i) => ({ time: d.time, cpu: cpuSm[i], ram: ramSm[i], latency: latSm[i] }));
  }, [chartData, smoothing, smoothingWindow]);

  // Compute status colors
  const statusColorClass = machine?.status === "online"
    ? "bg-emerald-500"
    : machine?.status === "delayed"
      ? "bg-amber-500"
      : "bg-slate-400";

  const healthColorClass = machine?.health_status === "Healthy"
    ? "text-emerald-600 bg-emerald-50 border-emerald-200"
    : machine?.health_status === "Warning"
      ? "text-amber-600 bg-amber-50 border-amber-200"
      : "text-rose-600 bg-rose-50 border-rose-200";

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb and Header Cockpit bar */}
      <div className="flex items-start justify-between gap-4 flex-col lg:flex-row border-b border-slate-200/60 pb-5">
        <div className="space-y-1.5">
          <Link to="/machines" className="inline-flex items-center gap-1 text-sm font-semibold text-pine hover:underline">
            <span>←</span> Back to Fleet Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-ink tracking-tight">{machine?.hostname ?? "Machine Details"}</h1>
            {machine && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white ${statusColorClass}`}>
                <span className="h-1.5 w-1.5 bg-white rounded-full animate-ping"></span>
                {machine.status}
              </span>
            )}
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">
              <span className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${heartbeat ? "bg-emerald-500 scale-125 shadow-md shadow-emerald-200" : "bg-slate-300"}`}></span>
              <span>LIVE POLLING</span>
            </div>
          </div>
          <p className="text-sm text-slate-500">Real-time performance metrics, system status, and system specifications.</p>
        </div>

        {machine && (
          <div className="flex gap-4">
            <div className={`rounded-xl border px-4 py-3 text-center ${healthColorClass}`}>
              <p className="text-xs uppercase font-bold tracking-wider opacity-85">Health Index</p>
              <p className="text-3xl font-black mt-0.5">{machine.health_score ?? "-"}</p>
              <p className="text-[10px] font-bold tracking-widest uppercase mt-0.5">{machine.health_status ?? "UNKNOWN"}</p>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="panel text-slate-600 py-10 text-center font-medium animate-pulse">Initializing cockpit telemetry interfaces...</div>}
      {error && <div className="panel text-rose-700 bg-rose-50 border border-rose-200 p-6">{error}</div>}

      {machine && !loading && (
        <>
          {/* Navigation Tabs Bar */}
          <div className="flex items-center justify-between border-b border-slate-200">
            <div className="flex gap-2 -mb-px">
              <button
                type="button"
                onClick={() => setActiveTab("cockpit")}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all duration-200 ${
                  activeTab === "cockpit"
                    ? "border-pine text-pine font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                <span>🎛️</span> Live Cockpit & Specs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all duration-200 ${
                  activeTab === "history"
                    ? "border-pine text-pine font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                <span>🧠</span> Performance History & AI Logs
              </button>
            </div>
          </div>

          {/* TAB 1: LIVE COCKPIT & SPECS */}
          {activeTab === "cockpit" && (
            <div className="space-y-6">
              {/* Glowing Metric Cards */}
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {usageCards.map((card) => (
                  <MetricCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    glowColor={card.glowColor}
                    icon={card.icon}
                    peakValue={card.peak}
                    progress={card.progress}
                  />
                ))}
              </section>

              {/* RDP & Network Diagnostics console */}
              {latestMetrics && (latestMetrics.rdp_active !== undefined || latestMetrics.packet_loss_pct !== undefined) && (
                <section className="space-y-4 bg-slate-900/95 text-slate-200 border border-slate-800 shadow-xl rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-40 w-40 bg-pine/10 rounded-full blur-3xl"></div>
                  <h2 className="text-md font-bold tracking-wide flex items-center gap-2 text-white">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    🌐 ACTIVE RDP & NETWORK DIAGNOSTICS
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 relative z-10">
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4">
                      <p className="text-xs uppercase font-semibold text-slate-500 tracking-wider">RDP Console Status</p>
                      <p className="mt-2 text-lg font-bold">
                        {latestMetrics.rdp_active ? (
                          <span className="text-cyan-400 flex items-center gap-2">
                            <span className="h-2 w-2 bg-cyan-400 rounded-full animate-ping"></span>
                            ACTIVE SESSION
                          </span>
                        ) : (
                          <span className="text-slate-400">NO SESSION</span>
                        )}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4">
                      <p className="text-xs uppercase font-semibold text-slate-500 tracking-wider">Packet Loss</p>
                      <p className={`mt-2 text-lg font-extrabold ${Number(latestMetrics.packet_loss_pct) > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                        {latestMetrics.packet_loss_pct !== undefined && latestMetrics.packet_loss_pct !== null ? `${latestMetrics.packet_loss_pct}%` : "-"}
                      </p>
                    </div>
                    {latestMetrics.rdp_active ? (
                      <>
                        <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4">
                          <p className="text-xs uppercase font-semibold text-slate-500 tracking-wider">RTT (Latency)</p>
                          <p className="mt-2 text-lg font-bold text-white">
                            {latestMetrics.rdp_rtt_ms !== undefined && latestMetrics.rdp_rtt_ms !== null ? `${latestMetrics.rdp_rtt_ms} ms` : "-"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4">
                          <p className="text-xs uppercase font-semibold text-slate-500 tracking-wider">User Input Delay</p>
                          <p className="mt-2 text-lg font-bold text-white">
                            {latestMetrics.rdp_input_delay_ms !== undefined && latestMetrics.rdp_input_delay_ms !== null ? `${latestMetrics.rdp_input_delay_ms} ms` : "-"}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 flex items-center justify-center text-xs text-slate-500 uppercase tracking-widest">
                        Start RDP connection on workstation to see latency analysis
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Streaming Real-Time Chart panel */}
              <section className="panel space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-ink">Streaming Compute Metrics</h2>
                    <p className="text-xs text-slate-500">Live sliding time-series graph updating in real-time (1s refresh).</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap bg-slate-100 border border-slate-200/80 p-1.5 rounded-xl text-xs font-semibold text-slate-600">
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white cursor-pointer select-none">
                      <input type="checkbox" checked={showCpu} onChange={(e) => setShowCpu(e.target.checked)} className="text-indigo-600 rounded" />
                      <span>CPU</span>
                    </label>
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white cursor-pointer select-none">
                      <input type="checkbox" checked={showRam} onChange={(e) => setShowRam(e.target.checked)} className="text-amber-600 rounded" />
                      <span>RAM</span>
                    </label>
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white cursor-pointer select-none">
                      <input type="checkbox" checked={showLatency} onChange={(e) => setShowLatency(e.target.checked)} className="text-rose-600 rounded" />
                      <span>LATENCY</span>
                    </label>
                    <div className="h-4 w-px bg-slate-300"></div>
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white cursor-pointer select-none">
                      <input type="checkbox" checked={smoothing} onChange={(e) => setSmoothing(e.target.checked)} className="rounded" />
                      <span>SMOOTH</span>
                    </label>
                    {smoothing && (
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={smoothingWindow}
                        onChange={(e) => setSmoothingWindow(Math.max(1, Number(e.target.value) || 1))}
                        className="w-12 bg-white rounded border border-slate-200 px-1 py-0.5 text-center"
                      />
                    )}
                  </div>
                </div>

                {history.length > 0 ? (
                  <div className="w-full" style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={processedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748B" }} dy={10} />
                        <YAxis tick={{ fontSize: 10, fill: "#64748B" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgba(16, 20, 24, 0.95)",
                            border: "none",
                            borderRadius: "12px",
                            color: "#fff",
                            fontSize: "12px",
                            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                        {showCpu && <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />}
                        {showRam && <Area type="monotone" dataKey="ram" name="RAM %" stroke="#F59E0B" strokeWidth={2} fillOpacity={1} fill="url(#colorRam)" />}
                        {showLatency && <Area type="monotone" dataKey="latency" name="Latency (ms)" stroke="#F43F5E" strokeWidth={2} fillOpacity={1} fill="url(#colorLatency)" />}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[260px] flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                    No active telemetry signals to chart yet.
                  </div>
                )}
              </section>

              {/* Hardware Inventory Specs Card */}
              <section className="panel space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📋</span>
                  <h2 className="text-lg font-bold text-ink">Workstation Hardware Inventory Specs</h2>
                </div>
                {machine.inventory ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* CPU & Architecture */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
                      <h3 className="text-xs uppercase font-extrabold tracking-widest text-indigo-600 flex items-center gap-1.5">
                        <span>💻</span> CPU & Processing
                      </h3>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Processor Name</p>
                          <p className="text-xs font-semibold text-ink mt-0.5 leading-snug">{machine.inventory.cpu_name || "-"}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Logical Cores</p>
                            <p className="text-xs font-bold text-ink mt-0.5">{machine.inventory.cpu_cores || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Threads</p>
                            <p className="text-xs font-bold text-ink mt-0.5">{machine.inventory.cpu_threads || "-"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Memory & Storage */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
                      <h3 className="text-xs uppercase font-extrabold tracking-widest text-amber-600 flex items-center gap-1.5">
                        <span>⚡</span> Storage & Memory
                      </h3>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total RAM Installed</p>
                          <p className="text-xs font-bold text-ink mt-0.5">{formatValue(machine.inventory.ram_total_bytes)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Primary Disk Type</p>
                            <p className="text-xs font-semibold text-ink mt-0.5 uppercase">{String(machine.inventory.primary_disk || "-")}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Disk Capacity</p>
                            <p className="text-xs font-bold text-ink mt-0.5">{formatValue(machine.inventory.disk_size_bytes)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Platform & Environment */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
                      <h3 className="text-xs uppercase font-extrabold tracking-widest text-violet-600 flex items-center gap-1.5">
                        <span>🏷️</span> System & Environment
                      </h3>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Manufacturer</p>
                            <p className="text-xs font-semibold text-ink mt-0.5">{machine.inventory.manufacturer || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Model</p>
                            <p className="text-xs font-semibold text-ink mt-0.5 leading-snug">{machine.inventory.model || "-"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">OS Version</p>
                            <p className="text-xs font-semibold text-ink mt-0.5 leading-snug">{machine.os_version || machine.inventory.windows_version || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Serial Number</p>
                            <p className="text-xs font-mono font-semibold text-ink mt-0.5">{machine.inventory.serial_number || "-"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">No inventory specs gathered from endpoint agent yet.</p>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: PERFORMANCE HISTORY & AI LOGS */}
          {activeTab === "history" && (
            <div className="space-y-6">
              {/* AI Diagnostics Core control */}
              <section className="panel space-y-4 border border-indigo-100 shadow-lg shadow-indigo-100/20 bg-indigo-50/20">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                      <span>🧠</span> Gemini AI Deep-Dive Diagnostic Expert
                    </h2>
                    <p className="text-xs text-slate-500">Retrieves last 48 telemetry historical aggregates and unresolved signals for analysis.</p>
                  </div>
                  <button
                    type="button"
                    disabled={aiAnalyzing}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all disabled:opacity-60"
                    onClick={async () => {
                      if (!id) return;
                      setAiAnalyzing(true);
                      try {
                        const res = await analyzeMachine(id);
                        setAnalysis(res);
                        const rows = await getMachineAnalyses(id);
                        setAnalyses(rows || []);
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setAiAnalyzing(false);
                      }
                    }}
                  >
                    {aiAnalyzing ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                        <span>Gemini is learning & analyzing...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Run AI Analysis</span>
                      </>
                    )}
                  </button>
                </div>

                {analysis && (
                  <div className="rounded-2xl border border-indigo-100 bg-white p-5 space-y-4 shadow-sm animate-fadeIn">
                    <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Severity Status:</span>
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide border ${
                          analysis.severity === "critical"
                            ? "bg-rose-50 border-rose-200 text-rose-600 animate-pulse"
                            : analysis.severity === "warning"
                              ? "bg-amber-50 border-amber-200 text-amber-600"
                              : "bg-emerald-50 border-emerald-200 text-emerald-600"
                        }`}>
                          {analysis.severity}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Confidence Score:</span>
                        <span className="text-sm font-black text-indigo-600">{analysis.confidence}%</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Diagnostic Summary</h4>
                        <p className="mt-1 text-sm font-semibold text-slate-700 leading-relaxed">{analysis.summary}</p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 pt-2">
                        <div className="space-y-2">
                          <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Detected Performance Signals</h4>
                          <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                            {analysis.signals && analysis.signals.length > 0 ? (
                              analysis.signals.map((sig, idx) => <li key={idx} className="leading-snug">{sig}</li>)
                            ) : (
                              <li>No structural telemetry anomalies detected</li>
                            )}
                          </ul>
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Recommended Expert Actions</h4>
                          <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                            {analysis.recommendations && analysis.recommendations.length > 0 ? (
                              analysis.recommendations.map((rec, idx) => <li key={idx} className="leading-snug font-medium text-pine">{rec}</li>)
                            ) : (
                              <li>No intervention needed currently. Keep monitoring</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="panel space-y-4 border border-slate-200 bg-white/90 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <h2 className="text-md font-bold text-ink">Filter Performance History</h2>
                    <p className="text-xs text-slate-500">Pick a local day to load that slice of telemetry. Leave it blank to show the latest window.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      value={selectedDay}
                      max={getTodayLocalInputValue()}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none"
                    />
                    {selectedDay && (
                      <button
                        type="button"
                        onClick={() => setSelectedDay("")}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-1">
                    {selectedDay ? `Showing ${selectedDay}` : "Showing latest telemetry"}
                  </span>
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-1">
                    {history.length} samples loaded
                  </span>
                  {historyRange && <span className="inline-flex rounded-full bg-slate-100 px-2 py-1">Filtered by local day range</span>}
                </div>
              </section>

                  {/* Historical averages computed over last 200 telemetry points */}
              <section className="panel space-y-4">
                <div>
                  <h2 className="text-md font-bold text-ink">
                    Computed Aggregate Statistics {selectedDay ? `(${selectedDay})` : "(Latest window)"}
                  </h2>
                  <p className="text-xs text-slate-500">Historical performance averages and absolute peaks observed in the current view.</p>
                </div>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <p className="text-xs uppercase text-slate-400 font-bold">CPU Average</p>
                    <p className="text-2xl font-extrabold mt-1 text-slate-800">
                      {history.length > 0
                        ? `${(history.reduce((a, b) => a + (Number(metricValue(b.metrics, ["cpu", "cpu_percent", "cpu_usage"])) || 0), 0) / history.length).toFixed(1)}%`
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <p className="text-xs uppercase text-slate-400 font-bold">RAM Average</p>
                    <p className="text-2xl font-extrabold mt-1 text-slate-800">
                      {history.length > 0
                        ? `${(history.reduce((a, b) => a + (Number(metricValue(b.metrics, ["ram", "memory_percent", "ram_usage"])) || 0), 0) / history.length).toFixed(1)}%`
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <p className="text-xs uppercase text-slate-400 font-bold">GPU Average</p>
                    <p className="text-2xl font-extrabold mt-1 text-slate-800">
                      {history.length > 0
                        ? `${(history.reduce((a, b) => a + (Number(metricValue(b.metrics, ["gpu", "gpu_percent", "gpu_usage"])) || 0), 0) / history.length).toFixed(1)}%`
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <p className="text-xs uppercase text-slate-400 font-bold">Latency Average</p>
                    <p className="text-2xl font-extrabold mt-1 text-slate-800">
                      {history.length > 0
                        ? `${(history.reduce((a, b) => a + (Number(metricValue(b.metrics, ["latency_ms", "latency"])) || 0), 0) / history.length).toFixed(1)} ms`
                        : "-"}
                    </p>
                  </div>
                </div>
              </section>

              {/* Historical Telemetry Logs Table */}
              <section className="panel space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-md font-bold text-ink">Historical Telemetry Log Entries</h2>
                    <p className="text-xs text-slate-500">Live-feed logs collected from the endpoint agent for the selected window.</p>
                  </div>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">{history.length} samples loaded</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500">
                        <th className="p-3">Created</th>
                        <th className="p-3">CPU Usage</th>
                        <th className="p-3">RAM Usage</th>
                        <th className="p-3">GPU Usage</th>
                        <th className="p-3">Network Latency</th>
                        <th className="p-3">RDP active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((entry) => {
                        const cpu = Number(metricValue(entry.metrics, ["cpu", "cpu_percent", "cpu_usage"])) || 0;
                        const ram = Number(metricValue(entry.metrics, ["ram", "memory_percent", "ram_usage"])) || 0;
                        const gpu = Number(metricValue(entry.metrics, ["gpu", "gpu_percent", "gpu_usage"])) || 0;
                        const latency = Number(metricValue(entry.metrics, ["latency_ms", "latency"])) || 0;
                        const rdp = !!metricValue(entry.metrics, ["rdp_active"]);

                        return (
                          <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-semibold text-slate-500">{formatTime(entry.created_at)}</td>
                            <td className={`p-3 font-bold ${cpu > 80 ? "text-rose-600 bg-rose-50/30" : "text-slate-700"}`}>{cpu.toFixed(1)}%</td>
                            <td className={`p-3 font-bold ${ram > 85 ? "text-amber-600 bg-amber-50/30" : "text-slate-700"}`}>{ram.toFixed(1)}%</td>
                            <td className="p-3 text-slate-600">{gpu.toFixed(1)}%</td>
                            <td className={`p-3 font-semibold ${latency > 150 ? "text-rose-600 bg-rose-50/30" : "text-slate-600"}`}>{latency.toFixed(1)} ms</td>
                            <td className="p-3">
                              {rdp ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-600 font-bold border border-cyan-100">active</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {history.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400 font-medium">No telemetry samples loaded yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
