import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getMachines } from "../api";
import type { Machine } from "../types";

export default function Machines() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [osFilter, setOsFilter] = useState("all");
  const [licenseTypeFilter, setLicenseTypeFilter] = useState("all");
  
  // Layout state: "table" or "grid"
  const [layout, setLayout] = useState<"table" | "grid">("table");

  // Selection state for on-demand downloads
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Copy state helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await getMachines(1, 100);
        if (!cancelled) {
          setMachines(response.items);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute stats metrics for cards
  const stats = useMemo(() => {
    const total = machines.length;
    const activated = machines.filter((m) => m.oem_activation_status?.includes("Active") || m.oem_activation_status?.includes("Licensed")).length;
    const activationRatio = total > 0 ? Math.round((activated / total) * 100) : 0;
    
    const retail = machines.filter((m) => m.windows_license_channel?.toLowerCase() === "retail").length;
    const oem = machines.filter((m) => m.windows_license_channel?.toLowerCase() === "oem").length;
    const volume = machines.filter((m) => m.windows_license_channel?.toLowerCase() === "volume").length;

    return { total, activationRatio, retail, oem, volume };
  }, [machines]);

  // Apply filters
  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      // 1. Search term match (hostname, username, model, serial_number, OS, license key, IP)
      const term = searchTerm.toLowerCase();
      const matchSearch =
        m.hostname.toLowerCase().includes(term) ||
        (m.username && m.username.toLowerCase().includes(term)) ||
        (m.model && m.model.toLowerCase().includes(term)) ||
        (m.serial_number && m.serial_number.toLowerCase().includes(term)) ||
        (m.windows_license_key && m.windows_license_key.toLowerCase().includes(term)) ||
        (m.ip_address && m.ip_address.toLowerCase().includes(term)) ||
        (m.os_version && m.os_version.toLowerCase().includes(term));

      // 2. Status match
      const matchStatus = statusFilter === "all" || m.status === statusFilter;

      // 3. OS Category Filter match
      let matchOs = true;
      if (osFilter === "win11") {
        matchOs = !!m.os_version?.toLowerCase().includes("windows 11");
      } else if (osFilter === "win10") {
        matchOs = !!m.os_version?.toLowerCase().includes("windows 10");
      }

      // 4. License Channel Filter match
      let matchLicense = true;
      if (licenseTypeFilter !== "all") {
        matchLicense = m.windows_license_channel?.toLowerCase() === licenseTypeFilter.toLowerCase();
      }

      return matchSearch && matchStatus && matchOs && matchLicense;
    });
  }, [machines, searchTerm, statusFilter, osFilter, licenseTypeFilter]);

  // Toggle selection for a single machine
  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Toggle select all currently filtered machines
  const toggleSelectAll = () => {
    const allFilteredSelected = filteredMachines.every((m) => selectedIds.has(m.id));
    const next = new Set(selectedIds);
    if (allFilteredSelected) {
      // Uncheck all in current filtered list
      filteredMachines.forEach((m) => next.delete(m.id));
    } else {
      // Check all in current filtered list
      filteredMachines.forEach((m) => next.add(m.id));
    }
    setSelectedIds(next);
  };

  // Copy product key to clipboard
  const handleCopyKey = (key: string) => {
    void navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Export to CSV helper
  const handleDownload = (onDemandOnly: boolean) => {
    const targets = onDemandOnly 
      ? machines.filter((m) => selectedIds.has(m.id))
      : filteredMachines;

    if (targets.length === 0) {
      alert("No machines selected or available for export!");
      return;
    }

    // Define CSV Headers exactly reflecting separate columns
    const headers = [
      "Hostname",
      "Status",
      "Health Score",
      "Health Status",
      "Active Login User",
      "Manufacturer",
      "Model",
      "Serial Number",
      "CPU Name",
      "RAM Capacity",
      "Storage Capacity",
      "GPU Name",
      "OS Caption",
      "OS Architecture",
      "OS Install Date",
      "Windows License Key",
      "License Channel Type",
      "OEM Activation Status",
      "Other Local User Accounts",
      "IP Address",
      "MAC Address",
      "System Boot Time",
      "Last Seen"
    ];

    // Build Rows
    const rows = targets.map((m) => [
      m.hostname,
      m.status,
      m.health_score ?? "-",
      m.health_status ?? "UNKNOWN",
      m.username ?? "-",
      m.manufacturer ?? "-",
      m.model ?? "-",
      m.serial_number ?? "-",
      m.cpu_name ?? "-",
      m.ram_total_bytes ? `${Math.round(m.ram_total_bytes / (1024**3))} GB` : "-",
      m.disk_size_bytes ? `${Math.round(m.disk_size_bytes / (1024**3))} GB` : "-",
      m.gpu_name ?? "-",
      m.os_version ?? "-",
      m.os_architecture ?? "-",
      m.os_install_date ?? "-",
      m.windows_license_key ?? "-",
      m.windows_license_channel ?? "-",
      m.oem_activation_status ?? "-",
      m.local_active_accounts ?? "-",
      m.ip_address ?? "-",
      m.mac_address ?? "-",
      m.last_boot_time ?? "-",
      m.last_seen ?? "-"
    ]);

    // Format content
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    // Download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `EndpointWatch_Specifications_${onDemandOnly ? "Selected" : "All"}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <header className="border-b border-slate-200/60 pb-5">
        <h1 className="text-3xl font-extrabold text-ink tracking-tight">Workstation Inventory & Specifications</h1>
        <p className="text-sm text-slate-500">Live monitoring of system specifications, hardware inventory details, OS configurations, and product keys.</p>
      </header>

      {/* Fleet Stats Ribbon */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Activation Ratio */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-500/[0.03] p-5 shadow-sm hover:shadow-md transition duration-200">
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-xs font-extrabold uppercase tracking-wider">Activated Ratio</span>
            <span className="text-lg">🛡️</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-black text-emerald-700">{stats.activationRatio}%</p>
            <span className="text-xs font-semibold text-slate-400">activated</span>
          </div>
          <div className="mt-3.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.activationRatio}%` }}></div>
          </div>
        </div>

        {/* Retail License count */}
        <div className="rounded-2xl border border-indigo-100 bg-indigo-500/[0.03] p-5 shadow-sm hover:shadow-md transition duration-200">
          <div className="flex items-center justify-between text-indigo-600">
            <span className="text-xs font-extrabold uppercase tracking-wider">Retail Channels</span>
            <span className="text-lg">🏷️</span>
          </div>
          <p className="text-3xl font-black text-indigo-700 mt-3">{stats.retail}</p>
          <p className="text-xs text-slate-500 mt-1">Computers on Retail licenses</p>
        </div>

        {/* OEM count */}
        <div className="rounded-2xl border border-teal-100 bg-teal-500/[0.03] p-5 shadow-sm hover:shadow-md transition duration-200">
          <div className="flex items-center justify-between text-teal-600">
            <span className="text-xs font-extrabold uppercase tracking-wider">OEM Channels</span>
            <span className="text-lg">🔌</span>
          </div>
          <p className="text-3xl font-black text-teal-700 mt-3">{stats.oem}</p>
          <p className="text-xs text-slate-500 mt-1">Active OEM device activations</p>
        </div>

        {/* Volume license count */}
        <div className="rounded-2xl border border-violet-100 bg-violet-500/[0.03] p-5 shadow-sm hover:shadow-md transition duration-200">
          <div className="flex items-center justify-between text-violet-600">
            <span className="text-xs font-extrabold uppercase tracking-wider">Volume Licenses</span>
            <span className="text-lg">🌐</span>
          </div>
          <p className="text-3xl font-black text-violet-700 mt-3">{stats.volume}</p>
          <p className="text-xs text-slate-500 mt-1">Enterprise Volume licenses</p>
        </div>
      </section>

      {/* Searching, Filtering, and Actions toolbar */}
      <section className="flex flex-col xl:flex-row items-center justify-between gap-4 bg-white/80 border border-slate-200/60 p-4 rounded-2xl shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-3 w-full">
          {/* Hostname Search */}
          <div className="relative flex-grow min-w-[280px]">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search hostname, product key, user or IP address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-pine focus:bg-white"
            />
          </div>

          {/* Status filter dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="online">Online</option>
            <option value="delayed">Delayed</option>
            <option value="offline">Offline</option>
          </select>

          {/* OS category filter dropdown */}
          <select
            value={osFilter}
            onChange={(e) => setOsFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
          >
            <option value="all">All OS Versions</option>
            <option value="win11">Windows 11 Pro</option>
            <option value="win10">Windows 10 Pro</option>
          </select>

          {/* License channel type filter */}
          <select
            value={licenseTypeFilter}
            onChange={(e) => setLicenseTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
          >
            <option value="all">All Channels</option>
            <option value="retail">Retail</option>
            <option value="oem">OEM</option>
            <option value="volume">Volume</option>
          </select>
        </div>

        {/* Action Controls for Selection & CSV download */}
        <div className="flex items-center flex-wrap gap-2 w-full xl:w-auto justify-between xl:justify-end">
          <div className="flex items-center gap-2">
            {/* Download Selected on-demand */}
            <button
              type="button"
              onClick={() => handleDownload(true)}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-pine px-4 py-2 text-xs font-bold text-white shadow hover:bg-teal-800 transition disabled:opacity-50"
            >
              <span>📥</span> Export Selected ({selectedIds.size})
            </button>
            {/* Download All */}
            <button
              type="button"
              onClick={() => handleDownload(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <span>📂</span> Export All Filtered ({filteredMachines.length})
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

          {/* View Layout Toggle buttons */}
          <div className="flex items-center gap-1 bg-slate-100 border border-slate-200/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setLayout("table")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                layout === "table" ? "bg-white text-pine shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              📊 Table List
            </button>
            <button
              type="button"
              onClick={() => setLayout("grid")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                layout === "grid" ? "bg-white text-pine shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              🎛️ Specs Grid
            </button>
          </div>
        </div>
      </section>

      {/* Main content display */}
      {loading ? (
        <div className="panel text-slate-600 py-10 text-center font-medium animate-pulse">
          Loading fleet endpoint tables...
        </div>
      ) : (
        <>
          {/* LAYOUT A: TABLE LIST */}
          {layout === "table" && (
            <div className="panel overflow-hidden border border-slate-200/60 shadow-lg p-0 rounded-2xl bg-white/95">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/80 font-bold text-slate-500 uppercase tracking-wider">
                      {/* Checkbox column */}
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredMachines.length > 0 && filteredMachines.every((m) => selectedIds.has(m.id))}
                          onChange={toggleSelectAll}
                          className="rounded text-pine focus:ring-pine cursor-pointer h-3.5 w-3.5"
                        />
                      </th>
                      <th className="p-3">Hostname</th>
                      <th className="p-3">Manufacturer</th>
                      <th className="p-3">Model</th>
                      <th className="p-3">Serial Number</th>
                      <th className="p-3">CPU</th>
                      <th className="p-3">RAM</th>
                      <th className="p-3">Storage</th>
                      <th className="p-3">GPU</th>
                      <th className="p-3">Operating System</th>
                      <th className="p-3">OS Architecture</th>
                      <th className="p-3">System Install Date</th>
                      <th className="p-3">Windows Product Key</th>
                      <th className="p-3">Licensing Channel</th>
                      <th className="p-3">OEM Activation Status</th>
                      <th className="p-3">Active Login User</th>
                      <th className="p-3">Other active profiles</th>
                      <th className="p-3">IP Address</th>
                      <th className="p-3">MAC Address</th>
                      <th className="p-3">System Boot Time</th>
                      <th className="p-3">Last Seen</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMachines.map((m) => {
                      const isChecked = selectedIds.has(m.id);
                      const statusDot = m.status === "online"
                        ? "bg-emerald-500"
                        : m.status === "delayed"
                          ? "bg-amber-500"
                          : "bg-slate-400";

                      // Channel Tag styles
                      const channelStyles = m.windows_license_channel === "Retail"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                        : m.windows_license_channel === "OEM"
                          ? "bg-teal-50 text-teal-700 border-teal-100"
                          : m.windows_license_channel === "Volume"
                            ? "bg-violet-50 text-violet-700 border-violet-100"
                            : "bg-slate-50 text-slate-600 border-slate-100";

                      const oemActive = m.oem_activation_status?.includes("Active") || m.oem_activation_status?.includes("Licensed");

                      return (
                        <tr 
                          key={m.id} 
                          className={`border-t border-slate-100 transition-colors hover:bg-slate-50/50 ${
                            isChecked ? "bg-pine/5 hover:bg-pine/10" : ""
                          }`}
                        >
                          {/* Checkbox Row selector */}
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelect(m.id)}
                              className="rounded text-pine focus:ring-pine cursor-pointer h-3.5 w-3.5"
                            />
                          </td>

                          {/* Hostname */}
                          <td className="p-3 font-bold text-slate-900">
                            <Link to={`/machines/${m.id}`} className="hover:underline text-pine font-extrabold text-xs block whitespace-nowrap">
                              {m.hostname}
                            </Link>
                          </td>

                          {/* Manufacturer */}
                          <td className="p-3 text-slate-700 whitespace-nowrap font-medium">{m.manufacturer || "-"}</td>

                          {/* Model */}
                          <td className="p-3 text-slate-700 whitespace-nowrap font-semibold">{m.model || "-"}</td>

                          {/* Serial Number */}
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{m.serial_number || "-"}</td>

                          {/* CPU */}
                          <td className="p-3 text-slate-600 whitespace-nowrap font-medium" title={m.cpu_name || ""}>
                            {m.cpu_name ? (
                              <span className="truncate max-w-[120px] block">{m.cpu_name}</span>
                            ) : (
                              "-"
                            )}
                          </td>

                          {/* RAM */}
                          <td className="p-3 text-slate-600 whitespace-nowrap font-medium">
                            {m.ram_total_bytes 
                              ? `${Math.round(m.ram_total_bytes / (1024 ** 3))} GB` 
                              : "-"}
                          </td>

                          {/* Storage */}
                          <td className="p-3 text-slate-600 whitespace-nowrap font-medium">
                            {m.disk_size_bytes 
                              ? `${Math.round(m.disk_size_bytes / (1024 ** 3))} GB` 
                              : "-"}
                          </td>

                          {/* GPU */}
                          <td className="p-3 text-slate-600 whitespace-nowrap font-medium" title={m.gpu_name || ""}>
                            {m.gpu_name ? (
                              <span className="truncate max-w-[120px] block">{m.gpu_name}</span>
                            ) : (
                              "-"
                            )}
                          </td>

                          {/* OS Caption */}
                          <td className="p-3 text-slate-700 font-semibold max-w-[180px] truncate" title={m.os_version || ""}>
                            {m.os_version ? (
                              <span className="flex items-center gap-1">
                                <span className="text-[10px]">🪟</span>
                                {m.os_version}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>

                          {/* OS Architecture */}
                          <td className="p-3 text-slate-600 whitespace-nowrap font-medium">{m.os_architecture || "-"}</td>

                          {/* OS Install Date */}
                          <td className="p-3 text-slate-600 whitespace-nowrap">
                            {m.os_install_date ? (
                              <div>
                                <p className="font-semibold text-slate-800">{m.os_install_date.split(" ")[0]}</p>
                                <p className="text-[9px] text-slate-400">{m.os_install_date.split(" ")[1]}</p>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>

                          {/* Windows License key badge (with copy clipboard) */}
                          <td className="p-3 whitespace-nowrap">
                            {m.windows_license_key ? (
                              <button
                                type="button"
                                onClick={() => handleCopyKey(m.windows_license_key!)}
                                className="group inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 hover:border-indigo-300 font-mono text-[10px] font-bold text-indigo-700 px-2 py-0.5 rounded transition"
                                title="Click to copy product key"
                              >
                                <span>{m.windows_license_key}</span>
                                <span className="text-[9px] text-slate-400 group-hover:text-indigo-600">
                                  {copiedKey === m.windows_license_key ? "✓ Copied" : "📋"}
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* Licensing Channel Tag */}
                          <td className="p-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full border text-[9px] font-extrabold uppercase ${channelStyles}`}>
                              {m.windows_license_channel || "Unknown"}
                            </span>
                          </td>

                          {/* OEM Activation Status */}
                          <td className="p-3">
                            {m.oem_activation_status ? (
                              <span className={`inline-flex px-2 py-0.5 rounded border text-[9px] font-bold ${
                                oemActive 
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                  : "bg-rose-50 border-rose-200 text-rose-700"
                              }`}>
                                {m.oem_activation_status}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>

                          {/* Active Login User profile */}
                          <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{m.username || "-"}</td>

                          {/* Other active local accounts */}
                          <td className="p-3 text-slate-600 max-w-[140px] truncate" title={m.local_active_accounts || ""}>
                            {m.local_active_accounts || "-"}
                          </td>

                          {/* IP Address */}
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{m.ip_address || "-"}</td>

                          {/* MAC Address */}
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{m.mac_address || "-"}</td>

                          {/* System Boot Time */}
                          <td className="p-3 font-mono text-slate-600 whitespace-nowrap">{m.last_boot_time || "-"}</td>

                          {/* Last Seen */}
                          <td className="p-3 text-slate-600 whitespace-nowrap">{m.last_seen ? new Date(m.last_seen).toLocaleString() : "-"}</td>

                          {/* Status */}
                          <td className="p-3">
                            <div className="flex items-center justify-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${statusDot}`}>
                                {m.status}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredMachines.length === 0 && (
                      <tr>
                        <td colSpan={22} className="p-8 text-center text-slate-400 font-medium">
                          No workstation endpoints matched the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LAYOUT B: SPECS GRID */}
          {layout === "grid" && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredMachines.map((m) => {
                const isChecked = selectedIds.has(m.id);
                const statusBorder = isChecked
                  ? "border-pine ring-2 ring-pine/20 shadow-pine/10 bg-pine/5"
                  : m.status === "online"
                    ? "border-emerald-100 hover:border-emerald-300 shadow-emerald-50/40"
                    : m.status === "delayed"
                      ? "border-amber-100 hover:border-amber-300 shadow-amber-50/40"
                      : "border-slate-100 hover:border-slate-300 shadow-slate-50/40";

                const statusColor = m.status === "online"
                  ? "bg-emerald-500"
                  : m.status === "delayed"
                    ? "bg-amber-500"
                    : "bg-slate-400";

                const oemActive = m.oem_activation_status?.includes("Active") || m.oem_activation_status?.includes("Licensed");

                return (
                  <div key={m.id} className={`rounded-2xl border p-5 bg-white/95 shadow-md flex flex-col justify-between transition-all duration-300 backdrop-blur-sm ${statusBorder}`}>
                    <div className="space-y-4">
                      {/* Hostname header */}
                      <div className="flex items-start justify-between">
                        <div className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(m.id)}
                            className="rounded text-pine focus:ring-pine cursor-pointer mt-1"
                          />
                          <div>
                            <Link to={`/machines/${m.id}`} className="text-md font-bold text-pine hover:underline">
                              {m.hostname}
                            </Link>
                            <span className="text-[10px] text-slate-400 block font-semibold">User: {m.username || "-"}</span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide text-white ${statusColor}`}>
                          {m.status}
                        </span>
                      </div>

                      {/* OS & Licensing specs box */}
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 space-y-2.5 text-xs">
                        <div>
                          <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Operating System</p>
                          <p className="font-semibold text-slate-700 leading-snug">{m.os_version || "-"}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/40">
                          <div>
                            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Architecture</p>
                            <p className="font-bold text-slate-700">{m.os_architecture || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Install Date</p>
                            <p className="font-bold text-slate-700 truncate">{m.os_install_date || "-"}</p>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-200/40 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-400 uppercase font-bold">Channel</span>
                            <span className="font-extrabold text-indigo-700 text-[10px] uppercase bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                              {m.windows_license_channel || "Unknown"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-400 uppercase font-bold">Activation Status</span>
                            <span className={`font-bold text-[9px] px-2 py-0.5 rounded border ${
                              oemActive ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
                            }`}>{m.oem_activation_status || "-"}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-400 uppercase font-bold">Product Key</span>
                            {m.windows_license_key ? (
                              <button
                                type="button"
                                onClick={() => handleCopyKey(m.windows_license_key!)}
                                className="font-mono text-slate-700 text-[10px] hover:text-indigo-600 flex items-center gap-1"
                              >
                                <span>{m.windows_license_key}</span>
                                <span>{copiedKey === m.windows_license_key ? "✓" : "📋"}</span>
                              </button>
                            ) : (
                              <span className="text-slate-400">Digital / None</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer scores */}
                    <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                      <span className="text-[9px] uppercase font-bold text-slate-400">
                        Serial: <span className="font-mono font-semibold text-slate-600">{m.serial_number || "-"}</span>
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 truncate max-w-[120px]">
                        Model: {m.model || "-"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredMachines.length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-400 font-semibold border-2 border-dashed border-slate-200 rounded-2xl bg-white/95">
                  No workstation endpoints matched the current filters.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
