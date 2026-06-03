import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import Dashboard from "./pages/Dashboard";
import Machines from "./pages/Machines";
import Alerts from "./pages/Alerts";
import FleetAIPage from "./pages/FleetAI";
import AgentSetupPage from "./pages/AgentSetup";
import MachineDetail from "./pages/MachineDetail";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="machines" element={<Machines />} />
          <Route path="machines/:machineId" element={<MachineDetail />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="agent-setup" element={<AgentSetupPage />} />
          <Route path="fleet-ai" element={<FleetAIPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
