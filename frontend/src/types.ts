export interface Machine {
  id: number;
  hostname: string;
  os_version: string | null;
  last_seen: string | null;
  status: "online" | "delayed" | "offline" | string;
  health_status?: string | null;
  health_score?: number | null;
  username?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  cpu_name?: string | null;
  ram_total_bytes?: number | null;
  serial_number?: string | null;
  gpu_name?: string | null;
  disk_size_bytes?: number | null;
  windows_license_key?: string | null;
  oem_activation_status?: string | null;
  local_active_accounts?: string | null;
  ip_address?: string | null;
  mac_address?: string | null;
  last_boot_time?: string | null;
  windows_license_channel?: string | null;
  os_architecture?: string | null;
  os_install_date?: string | null;
  latest_metrics?: Record<string, number | string | boolean | null> | null;
}

export interface MachineDetail extends Machine {
  latest_metrics: Record<string, number | string | boolean | null> | null;
  inventory?: Record<string, number | string | boolean | null> | null;
  health_status?: string | null;
  health_score?: number | null;
  last_seen_status?: string | null;
}

export interface MachineAnalysisResult {
  machine_id: number;
  hostname: string;
  provider: string;
  model: string | null;
  generated_at: string;
  summary: string;
  severity: "critical" | "warning" | "normal" | string;
  confidence: number;
  signals: string[];
  recommendations: string[];
  ai_enabled: boolean;
}

export interface MachineAnalysisRecord extends MachineAnalysisResult {
  id: number;
}

export interface TelemetryPoint {
  id: number;
  timestamp: string | null;
  created_at: string;
  metrics: Record<string, number | string | boolean | null>;
}

export interface AlertItem {
  id: number;
  machine_id: number;
  hostname: string | null;
  alert_type: string;
  severity: string;
  message: string;
  metric_name: string | null;
  metric_value: number | null;
  threshold: number | null;
  is_resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}
