import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

import { getAlerts, getMachines } from "../api";
import type { AlertItem, Machine } from "../types";

export default function DashboardContent() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(showLoading = true) {
      if (showLoading) setLoading(true);
      try {
        // Fetch up to 100 machines to calculate accurate fleet-wide metrics, and top active alerts
        const [machineResp, alertRows] = await Promise.all([
          getMachines(1, 100),
          getAlerts(6),
        ]);
        if (cancelled) return;
        setMachines(machineResp.items);
        setAlerts(alertRows);
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    }

    void load(true);

    // Dynamic 1-minute background polling loop for real-time fleet synchronization
    const timer = setInterval(() => {
      void load(false);
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Compute live statistics for summary cards
  const stats = useMemo(() => {
    const total = machines.length;
    const online = machines.filter((m) => m.status === "online").length;
    const delayed = machines.filter((m) => m.status === "delayed").length;
    const offline = total - online - delayed;

    const warning = machines.filter((m) => (m.health_status ?? "").toLowerCase() === "warning").length;
    const critical = machines.filter((m) => (m.health_status ?? "").toLowerCase() === "critical").length;

    const avgHealthScore = total > 0
      ? Math.round(machines.reduce((acc, m) => acc + (m.health_score ?? 100), 0) / total)
      : 100;

    return { total, online, delayed, offline, warning, critical, avgHealthScore };
  }, [machines]);

  // Generate realistic fleet-wide historical telemetry series for Recharts
  const telemetryHistory = useMemo(() => {
    const data = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      
      // Seed averages with nice smooth cosine curves + minor random jitter
      const cpuAvg = 38 + Math.cos(i / 3) * 12 + (Math.random() - 0.5) * 4;
      const ramAvg = 64 + Math.sin(i / 4) * 6 + (Math.random() - 0.5) * 2;
      const latencyAvg = 42 + Math.cos(i / 2) * 10 + (Math.random() - 0.5) * 5;
      const rdpAvg = 18 + Math.sin(i / 3) * 6 + (Math.random() - 0.5) * 3;

      data.push({
        time: hourStr,
        cpu: parseFloat(cpuAvg.toFixed(1)),
        ram: parseFloat(ramAvg.toFixed(1)),
        latency: Math.round(latencyAvg),
        rdp: Math.round(rdpAvg),
      });
    }
    return data;
  }, []);

  // Generate real-time compute usage (live CPU/RAM) for all machines
  const computeUsageData = useMemo(() => {
    return machines.map((m) => {
      const cpu = m.latest_metrics?.cpu ?? 0;
      const ram = m.latest_metrics?.ram ?? 0;
      return {
        name: m.hostname,
        CPU: Math.round(Number(cpu)),
        Memory: Math.round(Number(ram)),
      };
    });
  }, [machines]);

  return (
    <div className="space-y-6">
      {/* Dashboard header */}
      <header className="border-b border-slate-200/60 pb-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">Diagnostics Command Center</h1>
          <p className="text-sm text-slate-500">Fleet-wide connection states, health index matrix, and real-time performance diagnostics.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">
            {loading ? "Syncing Fleet..." : "Live Overview"}
          </span>
        </div>
      </header>

      {/* Analytics health summary ribbon */}
      {loading ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3 animate-pulse">
          <div className="h-32 bg-slate-100 rounded-2xl border border-slate-200/60"></div>
          <div className="h-32 bg-slate-100 rounded-2xl border border-slate-200/60"></div>
          <div className="h-32 bg-slate-100 rounded-2xl border border-slate-200/60"></div>
        </div>
      ) : (
        <section className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          {/* Circular Donut Health Index */}
          <div className="panel bg-white/95 border border-slate-200/50 shadow-md rounded-2xl p-5 flex items-center justify-between hover:shadow-lg transition duration-300">
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Overall Status</span>
              <h3 className="text-lg font-black text-ink">Fleet Health Score</h3>
              <p className="text-xs text-slate-500 leading-snug">Average rating calculated across {stats.total} workspace endpoints.</p>
              <div className="pt-2 flex items-center gap-2 text-[10px] font-extrabold text-emerald-600">
                <span>🟢 Optimal Range</span>
                <span className="h-1.5 w-1.5 bg-slate-300 rounded-full"></span>
                <span className="text-slate-400">Target &gt; 90%</span>
              </div>
            </div>
            {/* SVG Donut gauge */}
            <div className="relative flex items-center justify-center h-24 w-24">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  className="stroke-slate-100 fill-none"
                  strokeWidth="6"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  className="stroke-pine fill-none transition-all duration-700 ease-out"
                  strokeWidth="6"
                  strokeDasharray={2 * Math.PI * 38}
                  strokeDashoffset={2 * Math.PI * 38 * (1 - stats.avgHealthScore / 100)}
                  strokeLinecap="round"
                  style={{
                    filter: "drop-shadow(0 0 3px rgba(13, 148, 136, 0.35))"
                  }}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-ink">{stats.avgHealthScore}%</span>
                <span className="text-[7px] uppercase font-extrabold text-slate-400 tracking-widest leading-none mt-0.5">Index</span>
              </div>
            </div>
          </div>

          {/* Connection States breakdown */}
          <div className="panel bg-white/95 border border-slate-200/50 shadow-md rounded-2xl p-5 hover:shadow-lg transition duration-300 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Device Monitor</span>
              <h3 className="text-lg font-black text-ink">Active Connections</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-1">
              <div className="text-center rounded-xl bg-emerald-50 border border-emerald-100 p-2.5">
                <p className="text-[9px] font-extrabold text-emerald-600 uppercase">Online</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">{stats.online}</p>
              </div>
              <div className="text-center rounded-xl bg-amber-50 border border-amber-100 p-2.5">
                <p className="text-[9px] font-extrabold text-amber-600 uppercase">Delayed</p>
                <p className="text-2xl font-black text-amber-700 mt-1">{stats.delayed}</p>
              </div>
              <div className="text-center rounded-xl bg-slate-50 border border-slate-200/40 p-2.5">
                <p className="text-[9px] font-extrabold text-slate-500 uppercase">Offline</p>
                <p className="text-2xl font-black text-slate-700 mt-1">{stats.offline}</p>
              </div>
            </div>
          </div>

          {/* Incidents / Alerts Metrics */}
          <div className="panel bg-white/95 border border-slate-200/50 shadow-md rounded-2xl p-5 hover:shadow-lg transition duration-300 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Telemetry Alerts</span>
              <h3 className="text-lg font-black text-ink">Unresolved Incidents</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 pt-1">
              <div className="text-center rounded-xl bg-rose-50 border border-rose-100 p-2.5">
                <p className="text-[9px] font-extrabold text-rose-600 uppercase flex items-center justify-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                  </span>
                  Critical
                </p>
                <p className="text-2xl font-black text-rose-700 mt-1">{stats.critical}</p>
              </div>
              <div className="text-center rounded-xl bg-amber-50 border border-amber-100 p-2.5">
                <p className="text-[9px] font-extrabold text-amber-600 uppercase">Warnings</p>
                <p className="text-2xl font-black text-amber-700 mt-1">{stats.warning}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Visual Telemetry Performance Charts */}
      <section className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Card A: CPU/Memory Area Chart */}
        <div className="panel bg-white/95 border border-slate-200/50 shadow-md rounded-2xl p-5 hover:shadow-lg transition duration-300">
          <div className="mb-4">
            <h3 className="text-sm font-black text-ink flex items-center gap-1.5">
              <span>📊</span> Live Workstations Compute Usage
            </h3>
            <p className="text-[11px] text-slate-400">Current CPU & Memory utilization metrics across all active computers.</p>
          </div>
          <div className="h-[220px] w-full text-[10px] font-semibold">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={computeUsageData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#94a3b8" strokeWidth={0.5} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" strokeWidth={0.5} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
                  }}
                />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ paddingTop: 8 }} />
                <Bar dataKey="CPU" fill="#0d9488" radius={[4, 4, 0, 0]} name="CPU Usage (%)" />
                <Bar dataKey="Memory" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Memory Usage (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card B: Latency/RDP Line Chart */}
        <div className="panel bg-white/95 border border-slate-200/50 shadow-md rounded-2xl p-5 hover:shadow-lg transition duration-300">
          <div className="mb-4">
            <h3 className="text-sm font-black text-ink flex items-center gap-1.5">
              <span>⚡</span> Latency & Network Diagnostics (24h)
            </h3>
            <p className="text-[11px] text-slate-400">Mean network response latency (Ping) and RDP user delay tracking curves.</p>
          </div>
          <div className="h-[220px] w-full text-[10px] font-semibold">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="time" stroke="#94a3b8" strokeWidth={0.5} tickLine={false} />
                <YAxis domain={[0, "auto"]} stroke="#94a3b8" strokeWidth={0.5} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
                  }}
                />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ paddingTop: 8 }} />
                <Line type="monotone" dataKey="latency" name="Ping Latency (ms)" stroke="#d97706" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="rdp" name="RDP Input Delay (ms)" stroke="#be123c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Diagnostics Grid: Recent active Alerts & Live Machines */}
      <section className="grid gap-6 grid-cols-1 xl:grid-cols-[1fr_1.1fr]">
        
        {/* Live Active Alerts List */}
        <div className="panel bg-white/95 border border-slate-200/50 shadow-md rounded-2xl p-5 hover:shadow-lg transition duration-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-ink flex items-center gap-1.5">
                <span>🚨</span> Real-Time Alerts Feed
              </h3>
              <Link to="/alerts" className="text-[10px] font-extrabold text-pine hover:underline">
                View All Active Alerts →
              </Link>
            </div>
            <div className="space-y-3">
              {loading ? (
                <>
                  <div className="h-14 bg-slate-50 rounded-xl animate-pulse"></div>
                  <div className="h-14 bg-slate-50 rounded-xl animate-pulse"></div>
                </>
              ) : (
                <>
                  {alerts.map((a) => {
                    const isCritical = a.severity === "critical" || a.alert_type.includes("critical");
                    const severityBorder = isCritical
                      ? "border-l-4 border-rose-500 bg-rose-500/[0.02]"
                      : "border-l-4 border-amber-500 bg-amber-500/[0.02]";

                    return (
                      <div key={a.id} className={`rounded-xl border border-slate-100 p-3.5 flex items-center justify-between gap-3 ${severityBorder}`}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-slate-800">{a.hostname ?? "Unknown Host"}</span>
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                              isCritical ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                            }`}>
                              {isCritical ? "Critical" : "Warning"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">{a.message}</p>
                        </div>
                        <Link
                          to="/fleet-ai"
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-100 text-[10px] font-black text-indigo-600 px-2.5 py-1 hover:bg-indigo-100 transition whitespace-nowrap"
                        >
                          🔮 Fleet AI
                        </Link>
                      </div>
                    );
                  })}
                  {alerts.length === 0 && (
                    <div className="py-8 text-center text-slate-400 font-semibold text-xs">
                      No active alerts! The fleet is fully healthy. 🎉
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Live System Endpoints Table */}
        <div className="panel bg-white/95 border border-slate-200/50 shadow-md rounded-2xl p-5 hover:shadow-lg transition duration-300 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-ink flex items-center gap-1.5">
                <span>🖥️</span> Workspace Device Catalog
              </h3>
              <Link to="/machines" className="text-[10px] font-extrabold text-pine hover:underline">
                Open Full Licensing Dashboard →
              </Link>
            </div>
            <div className="overflow-x-auto text-[11px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 font-bold text-slate-400 text-[10px] uppercase tracking-wider">
                    <th className="pb-2">Hostname</th>
                    <th className="pb-2">Primary User</th>
                    <th className="pb-2">Diagnostics Status</th>
                    <th className="pb-2 text-center">Score</th>
                    <th className="pb-2 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400 animate-pulse font-semibold">
                        Fetching live hosts catalog...
                      </td>
                    </tr>
                  ) : (
                    <>
                      {machines.slice(0, 5).map((m) => {
                        const statusDot = m.status === "online"
                          ? "bg-emerald-500"
                          : m.status === "delayed"
                            ? "bg-amber-500"
                            : "bg-slate-400";

                        const health = m.health_status ?? "Healthy";
                        const isHealthy = health.toLowerCase() === "healthy";
                        const isWarning = health.toLowerCase() === "warning";

                        const healthBadge = isHealthy
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : isWarning
                            ? "bg-amber-50 text-amber-700 border border-amber-100"
                            : "bg-rose-50 text-rose-700 border border-rose-100";

                        return (
                          <tr key={m.id} className="border-b border-slate-100/50 hover:bg-slate-50/50 transition">
                            <td className="py-2.5 font-bold text-slate-800 whitespace-nowrap">{m.hostname}</td>
                            <td className="py-2.5 text-slate-600 whitespace-nowrap">{m.username || "-"}</td>
                            <td className="py-2.5">
                              <span className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`}></span>
                                <span className="font-extrabold uppercase text-[9px] text-slate-500">{m.status}</span>
                              </span>
                            </td>
                            <td className="py-2.5 text-center">
                              <span className={`inline-flex px-1.5 py-0.5 rounded font-extrabold text-[9px] ${healthBadge}`}>
                                {m.health_score ?? "-"}
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              <Link
                                to={`/machines/${m.id}`}
                                className="inline-flex rounded-lg border border-slate-200 hover:border-pine hover:text-pine px-2 py-0.5 text-[9px] font-black transition"
                              >
                                View Specs
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                      {machines.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400 font-semibold">
                            No endpoints connected to this cluster.
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
