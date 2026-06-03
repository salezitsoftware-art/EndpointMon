# DASHBOARD_SPEC

## V1 pages

### Dashboard
- Online/offline machine overview cards
- Machine status table
- Active alerts panel
- Machine telemetry trend chart (CPU, RAM, GPU, latency)

### Machine detail (current embedded section)
- Latest metrics
- History chart using `/machines/{id}/history`

### Alerts
- Active alert list using `/alerts`

## Frontend stack

- React + TypeScript + Vite
- TailwindCSS for styling
- Axios for API calls
- Recharts for telemetry charts
