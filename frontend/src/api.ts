import axios from "axios";

import type { AlertItem, Machine, MachineAnalysisRecord, MachineAnalysisResult, MachineDetail, TelemetryPoint } from "./types";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:3000/api" : "/api");
const apiKey = import.meta.env.VITE_API_KEY ?? "replace_me";

const client = axios.create({
  baseURL,
  headers: {
    "x-api-key": apiKey,
  },
});

client.interceptors.request.use(
  (config) => {
    const customKey = localStorage.getItem("endpointwatch_gemini_api_key");
    if (customKey) {
      if (!config.headers) {
        config.headers = {} as any;
      }
      config.headers["x-gemini-api-key"] = customKey;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export async function getMachines(page = 1, per_page = 25): Promise<{ items: Machine[]; total: number; page: number; per_page: number; pages: number }> {
  const { data } = await client.get<{ items: Machine[]; total: number; page: number; per_page: number; pages: number }>(
    "/machines",
    { params: { page, per_page } }
  );
  return data;
}

export async function getMachine(machineId: number): Promise<MachineDetail> {
  const { data } = await client.get<MachineDetail>(`/machines/${machineId}`);
  return data;
}

export async function getMachineHistory(machineId: number, limit = 48): Promise<TelemetryPoint[]> {
  const { data } = await client.get<TelemetryPoint[]>(`/machines/${machineId}/history`, {
    params: { limit },
  });
  return data;
}

export async function getAlerts(limit = 20): Promise<AlertItem[]> {
  const { data } = await client.get<AlertItem[]>("/alerts", {
    params: { limit, active_only: true },
  });
  return data;
}

export async function analyzeMachine(machineId: number): Promise<MachineAnalysisResult> {
  // Prefer the LLM-backed analysis endpoint; fall back to legacy analysis route.
  try {
    const { data } = await client.post<MachineAnalysisResult>(`/ai/machines/${machineId}/analyze`);
    return data;
  } catch (err) {
    // If LLM endpoint is unavailable, fall back to older path
    const { data } = await client.post<MachineAnalysisResult>(`/machines/${machineId}/analysis`);
    return data;
  }
}

export async function getMachineAnalyses(machineId: number): Promise<MachineAnalysisRecord[]> {
  const { data } = await client.get<MachineAnalysisRecord[]>(`/ai/machines/${machineId}/analyses`);
  return data;
}

export async function sendFleetChatMessage(message: string): Promise<{ reply: string }> {
  const { data } = await client.post<{ reply: string }>("/ai/fleet-chat", { message });
  return data;
}


