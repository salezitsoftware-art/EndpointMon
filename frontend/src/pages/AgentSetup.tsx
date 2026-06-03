import React, { useEffect, useMemo, useState } from "react";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";
const apiKey = import.meta.env.VITE_API_KEY ?? "replace_me";

function CopyBlock({
  title,
  description,
  text,
  expanded,
  onToggle,
}: {
  title: string;
  description: string;
  text: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 p-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Script
          </div>
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {expanded ? "Fold" : "Unfold"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {copied ? "Copied" : "Copy script"}
          </button>
        </div>
      </div>
      {expanded && (
        <pre className="max-h-[34rem] overflow-auto bg-[#08111f] p-5 text-[11px] leading-6 text-slate-100">
          <code>{text}</code>
        </pre>
      )}
    </div>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 leading-6">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AgentSetupPage() {
  const [collectorScript, setCollectorScript] = useState("");
  const [installerScript, setInstallerScript] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collectorExpanded, setCollectorExpanded] = useState(true);
  const [installerExpanded, setInstallerExpanded] = useState(false);
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadScripts() {
      try {
        const [collectorResponse, installerResponse] = await Promise.all([
          fetch(`${baseURL}/agent/scripts/collector`, { headers: { "x-api-key": apiKey } }),
          fetch(`${baseURL}/agent/scripts/installer`, { headers: { "x-api-key": apiKey } }),
        ]);

        if (!collectorResponse.ok) {
          throw new Error(`Collector script fetch failed: ${collectorResponse.status}`);
        }
        if (!installerResponse.ok) {
          throw new Error(`Installer script fetch failed: ${installerResponse.status}`);
        }

        const [collector, installer] = await Promise.all([collectorResponse.text(), installerResponse.text()]);
        if (!cancelled) {
          setCollectorScript(collector);
          setInstallerScript(installer);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load agent scripts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadScripts();
    return () => {
      cancelled = true;
    };
  }, []);

  const overview = useMemo(
    () => [
      "The collector gathers CPU, RAM, disk, latency, Wi-Fi, GPU, monitor, and RDP metrics.",
      "It includes inventory details like manufacturer, model, serial number, Windows version, CPU, RAM, disk, GPU, network adapter, IP, and MAC address.",
      "Payloads include a local timestamp and a local_time string, then they are sent to /api/telemetry with x-api-key.",
    ],
    [],
  );

  const schedulerSteps = useMemo(
    () => [
      "Open PowerShell as Administrator on the target laptop.",
      "Run the collector once manually using your API key to validate the endpoint.",
      "Open Task Scheduler and create a new task named EndpointWatch-Telemetry.",
      "Set the task to run as SYSTEM with highest privileges.",
      "Add a trigger that repeats every 10 minutes.",
      "Set the action to run powershell.exe with -NoProfile -ExecutionPolicy Bypass -File collect-and-send.ps1.",
      "Save the task, run it once, and confirm telemetry arrives in the backend.",
    ],
    [],
  );

  const taskNotes = useMemo(
    () => [
      "Task name: EndpointWatch-Telemetry",
      "Account: SYSTEM",
      "Run level: Highest",
      "Repeat interval: 10 minutes by default",
      "Use the uninstall action in install-task.ps1 if you need to remove it later",
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-[28px] border border-white/60 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-[0_24px_80px_rgba(2,6,23,0.20)]">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.5fr_0.9fr] lg:p-8">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/90">
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1">Agent setup</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">PowerShell collector</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Task Scheduler</span>
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white lg:text-5xl">
                Full PowerShell script, deployment steps, and Task Scheduler instructions.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300 lg:text-base">
                This page shows the real collector script and installer script from the repository. Fold sections as needed, copy the script in one click, and follow the exact steps to deploy the task scheduler job.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-slate-300">Collector</div>
                <div className="font-semibold text-white">collect-and-send.ps1</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-slate-300">Installer</div>
                <div className="font-semibold text-white">install-task.ps1</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-slate-300">Target</div>
                <div className="font-semibold text-white">Windows laptops</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[24px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-emerald-200">At a glance</div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                {overview.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-2">
        <InfoCard title="What the collector covers" items={overview} />
        <InfoCard title="Task registration notes" items={taskNotes} />
      </section>

      {error && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Source scripts</p>
            <h2 className="text-2xl font-semibold text-slate-950">Fold or unfold each script once</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCollectorExpanded(true);
                setInstallerExpanded(true);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => {
                setCollectorExpanded(false);
                setInstallerExpanded(false);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Collapse all
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Loading script text from the backend...
          </div>
        ) : (
          <div className="space-y-4">
            <CopyBlock
              title="collect-and-send.ps1"
              description="Full collector script loaded once from agent/scripts/collect-and-send.ps1."
              text={collectorScript}
              expanded={collectorExpanded}
              onToggle={() => setCollectorExpanded((current) => !current)}
            />
            <CopyBlock
              title="install-task.ps1"
              description="Registers, checks, and removes the scheduled task."
              text={installerScript}
              expanded={installerExpanded}
              onToggle={() => setInstallerExpanded((current) => !current)}
            />
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-200/80 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Instructions</p>
              <h2 className="text-2xl font-semibold text-slate-950">Step-by-step Task Scheduler setup</h2>
            </div>
            <button
              type="button"
              onClick={() => setInstructionsExpanded((current) => !current)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {instructionsExpanded ? "Fold" : "Unfold"}
            </button>
          </div>
          {instructionsExpanded && (
            <div className="p-5">
              <ol className="space-y-3 list-decimal pl-5 text-sm leading-6 text-slate-700">
                {schedulerSteps.map((step) => (
                  <li key={step} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-emerald-500 to-slate-950 p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.15)]">
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/80">Validation</p>
            <h3 className="mt-2 text-xl font-semibold">What to check after installation</h3>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-emerald-50/95">
              <li>Run the collector once manually to confirm the API key and backend URL.</li>
              <li>Use the installer status action to confirm the scheduled task is present.</li>
              <li>Check the temp log file for successful telemetry posts.</li>
              <li>Look for a response id from the backend after each successful upload.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Troubleshooting</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <li>If the collector says the API key is missing, pass <span className="font-semibold">-ApiKey</span> or set <span className="font-semibold">ENDPOINTWATCH_API_KEY</span>.</li>
              <li>If PowerShell blocks execution, use <span className="font-semibold">-ExecutionPolicy Bypass</span> from an elevated shell.</li>
              <li>If telemetry does not arrive, confirm the backend is reachable on <span className="font-semibold">/api/telemetry</span>.</li>
              <li>If the task does not run, confirm it uses the <span className="font-semibold">SYSTEM</span> account and highest privileges.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
