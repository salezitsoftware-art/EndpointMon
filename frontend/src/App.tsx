import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-white p-4">
        <h2 className="text-xl font-bold mb-4">EndpointWatch</h2>
        <nav className="space-y-2">
          {[
            ["/", "Dashboard"],
            ["/machines", "Machines"],
            ["/alerts", "Alerts"],
            ["/fleet-ai", "Fleet AI"],
            ["/agent-setup", "Agent Setup"],
          ].map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `block px-3 py-2 rounded transition ${isActive ? "bg-slate-700 text-white" : "hover:bg-slate-800 text-slate-200"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
