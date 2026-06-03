import React, { useEffect, useState } from "react";

import { getAlerts } from "../api";
import type { AlertItem } from "../types";

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const rows = await getAlerts(100);
        if (!cancelled) {
          setAlerts(rows);
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

  return (
    <div className="space-y-4">
      <header className="panel">
        <h1 className="text-3xl font-bold text-ink">Alerts</h1>
        <p className="text-sm text-slate-600">Current issues and recent alert history.</p>
      </header>

      <section className="panel space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active Alerts</h2>
          <span className="text-xs text-slate-500">{loading ? "Loading..." : `${alerts.length} records`}</span>
        </div>
        {alerts.map((alert) => (
          <div key={alert.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3 flex-col md:flex-row md:items-start">
              <div>
                <p className="font-semibold text-ink">{alert.hostname ?? "Unknown host"}</p>
                <p className="text-sm text-slate-600">{alert.message}</p>
              </div>
              <div className="text-xs text-slate-500 md:text-right">
                <p>{alert.severity}</p>
                <p>{alert.created_at}</p>
              </div>
            </div>
          </div>
        ))}
        {!loading && alerts.length === 0 && <p className="text-sm text-slate-500">No active alerts.</p>}
      </section>
    </div>
  );
}
