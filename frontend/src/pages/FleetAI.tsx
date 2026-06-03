import React, { useState, useRef, useEffect } from "react";
import { sendFleetChatMessage } from "../api";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

export default function FleetAIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      sender: "ai",
      text: "Hello! I am your **EndpointWatch Fleet AI Analyst**. I have access to the latest telemetry metrics (CPU, RAM, disk, latency, Wi-Fi, monitor resolution, RDP status) and unresolved alerts across all workstations in the database.\n\nAsk me anything, or click one of the quick analysis templates below!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem("endpointwatch_gemini_api_key");
    if (savedKey) {
      setApiKeyInput(savedKey);
      setIsKeySaved(true);
    }
  }, []);

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyInput.trim()) {
      localStorage.setItem("endpointwatch_gemini_api_key", apiKeyInput.trim());
      setIsKeySaved(true);
      setStatusMessage("Key saved locally! Requests will now use your key.");
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem("endpointwatch_gemini_api_key");
    setApiKeyInput("");
    setIsKeySaved(false);
    setStatusMessage("Key cleared. Reverted to shared server key.");
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Auto-scroll to bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const quickPrompts = [
    { label: "📊 Fleet Health Check", text: "Please run a complete health check report on all workstations. Identify which are offline, delayed, or exhibiting abnormal resource consumption." },
    { label: "🔥 CPU Spikes", text: "Which workstations are currently experiencing CPU usage spikes or are above 80% usage? Who is affected?" },
    { label: "🔌 RDP & Latency Issues", text: "List all workstations that have active RDP sessions and flag any with latency above 100ms. Provide suggestions on RDP performance improvements." },
    { label: "💾 Disk Space Warning", text: "Show me all workstations with high disk space usage (above 80% C: drive used) and suggest storage cleaning actions." },
  ];

  function formatMessageText(text: string): string {
    // Simple robust markdown parser
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code blocks: ```code```
    html = html.replace(/```([\s\S]*?)```/g, (_match, code) => {
      return `<pre class="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto my-2 font-mono text-xs border border-slate-700">${code.trim()}</pre>`;
    });

    // Inline code: `code`
    html = html.replace(/`([^`\n]+)`/g, '<code class="bg-slate-100 text-rose-600 px-1 py-0.5 rounded font-mono text-xs border border-slate-200">$1</code>');

    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');

    // Parse list items and tables line-by-line
    const lines = html.split("\n");
    let inList = false;
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    
    const processedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if it's a table row (starts and ends with |)
      if (line.startsWith("|") && line.endsWith("|")) {
        if (inList) {
          processedLines.push("</ul>");
          inList = false;
        }
        
        // Parse columns
        const cells = line.split("|").map(c => c.trim()).slice(1, -1);
        const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
        
        if (isSeparator) {
          continue; // skip the separator line
        }
        
        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
          tableRows = [];
        } else {
          tableRows.push(cells);
        }
        continue;
      } else {
        // Close table if we are transitioning out of a table block
        if (inTable) {
          inTable = false;
          let tableHtml = '<div class="overflow-x-auto my-3 border border-slate-200 rounded-lg shadow-sm"><table class="min-w-full text-xs border-collapse bg-white overflow-hidden">';
          tableHtml += '<thead class="bg-slate-900 text-white">';
          tableHtml += '<tr>';
          tableHeaders.forEach(h => {
            tableHtml += `<th class="px-3 py-2 text-left font-semibold border-b border-slate-200 whitespace-nowrap">${h}</th>`;
          });
          tableHtml += '</tr>';
          tableHtml += '</thead>';
          tableHtml += '<tbody class="divide-y divide-slate-100">';
          tableRows.forEach((row, idx) => {
            tableHtml += `<tr class="${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-slate-50 transition">`;
            tableHeaders.forEach((_, colIdx) => {
              const cellVal = row[colIdx] !== undefined ? row[colIdx] : "";
              tableHtml += `<td class="px-3 py-2 border-slate-200 text-slate-700 whitespace-nowrap">${cellVal}</td>`;
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</tbody></table></div>';
          processedLines.push(tableHtml);
        }
      }
      
      // Handle standard lists
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const content = line.substring(2);
        if (!inList) {
          inList = true;
          processedLines.push(`<ul class="list-disc pl-5 my-2 space-y-1"><li>${content}</li>`);
        } else {
          processedLines.push(`<li>${content}</li>`);
        }
      } else {
        if (inList) {
          inList = false;
          processedLines.push("</ul>");
        }
        processedLines.push(line);
      }
    }
    
    // Close remaining table or list if necessary
    if (inTable) {
      let tableHtml = '<div class="overflow-x-auto my-3 border border-slate-200 rounded-lg shadow-sm"><table class="min-w-full text-xs border-collapse bg-white overflow-hidden">';
      tableHtml += '<thead class="bg-slate-900 text-white">';
      tableHtml += '<tr>';
      tableHeaders.forEach(h => {
        tableHtml += `<th class="px-3 py-2 text-left font-semibold border-b border-slate-200 whitespace-nowrap">${h}</th>`;
      });
      tableHtml += '</tr>';
      tableHtml += '</thead>';
      tableHtml += '<tbody class="divide-y divide-slate-100">';
      tableRows.forEach((row, idx) => {
        tableHtml += `<tr class="${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-slate-50 transition">`;
        tableHeaders.forEach((_, colIdx) => {
          const cellVal = row[colIdx] !== undefined ? row[colIdx] : "";
          tableHtml += `<td class="px-3 py-2 border-slate-200 text-slate-700 whitespace-nowrap">${cellVal}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';
      processedLines.push(tableHtml);
    }
    if (inList) {
      processedLines.push("</ul>");
    }
    
    return processedLines.join("\n").replace(/\n/g, "<br>");
  }

  async function handleSendMessage(messageText: string) {
    if (!messageText.trim() || loading) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(2, 9),
      sender: "user",
      text: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await sendFleetChatMessage(messageText);
      
      const aiMessage: Message = {
        id: Math.random().toString(36).substring(2, 9),
        sender: "ai",
        text: res.reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach Fleet AI assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] space-y-4">
      {/* Header Panel */}
      <header className="panel py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-ink">Fleet AI Assistant</h1>
            <p className="text-sm text-slate-500 mt-1">
              Ask Gemini to analyze real-time telemetry metrics and active alerts across all endpoints.
            </p>
          </div>
          {isKeySaved ? (
            <div className="hidden sm:flex items-center space-x-2 bg-indigo-50 border border-indigo-100 rounded-full px-3.5 py-1.5 text-indigo-800 text-xs font-semibold shadow-sm animate-pulse-slow">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
              </span>
              <span>Developer API Key Active</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center space-x-2 bg-emerald-50 border border-emerald-100 rounded-full px-3.5 py-1.5 text-emerald-800 text-xs font-semibold shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Gemini 1.5 Flash Connected</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Chat and Sidebar Area */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
        {/* Chat Area */}
        <section className="flex-1 panel flex flex-col min-h-0 p-0 overflow-hidden bg-white/70 backdrop-blur-md border border-slate-200/80 shadow-lg rounded-xl">
          {/* Scrollable Conversation History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scrollbar-thin">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} animate-fadeIn`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.sender === "user"
                      ? "bg-slate-900 text-white rounded-br-none"
                      : "bg-slate-50 text-slate-800 border border-slate-200 rounded-bl-none"
                  }`}
                >
                  {/* Sender Label */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold opacity-75">
                      {msg.sender === "user" ? "You (Admin)" : "Fleet AI Analyst"}
                    </span>
                    <span className="text-[10px] opacity-50 ml-4">
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div
                    className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: formatMessageText(msg.text) }}
                  />
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {loading && (
              <div className="flex justify-start animate-pulse">
                <div className="max-w-[75%] rounded-2xl rounded-bl-none bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm text-slate-500">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-600">Analyzing fleet telemetry</span>
                    <div className="flex space-x-1">
                      <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex justify-center">
                <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-2 text-center max-w-md shadow-sm">
                  <p className="font-semibold mb-0.5">Error Running Fleet Query</p>
                  <p>{error}</p>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Quick analysis templates */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-2 flex-shrink-0">
            <span className="text-xs font-semibold text-slate-500 self-center">Quick templates:</span>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                className="bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-slate-700 text-xs px-3 py-1.5 rounded-full transition font-medium shadow-sm disabled:opacity-55"
                onClick={() => handleSendMessage(prompt.text)}
                disabled={loading}
              >
                {prompt.label}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(input);
            }}
            className="p-3 border-t border-slate-200 bg-white flex items-center gap-3 flex-shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Gemini to run fleet-wide metrics audit..."
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 disabled:bg-slate-50"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              Analyze
            </button>
          </form>
        </section>

        {/* Gemini API Key Settings Panel */}
        <aside className="w-full md:w-80 flex-shrink-0 bg-white/70 backdrop-blur-md border border-slate-200/80 shadow-lg rounded-xl p-5 flex flex-col space-y-4 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-slate-900/5 text-slate-700">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-3.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800">Gemini Settings</h2>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Configure a custom Gemini API key to override shared server rate limits and use your developer quota.
          </p>

          <form onSubmit={handleSaveKey} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="api-key-input" className="text-xs font-semibold text-slate-700 flex justify-between items-center">
                <span>Developer API Key</span>
                <span className={`h-2 w-2 rounded-full ${isKeySaved ? "bg-indigo-500 animate-pulse" : "bg-slate-300"}`} />
              </label>
              <div className="relative">
                <input
                  id="api-key-input"
                  type={showKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full rounded-lg border border-slate-300 bg-white/50 pl-3 pr-10 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-slate-800 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  title={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {statusMessage && (
              <div className="text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2.5 py-1.5 animate-fadeIn">
                {statusMessage}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={!apiKeyInput.trim()}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg py-2.5 text-xs transition disabled:opacity-50 disabled:cursor-not-allowed text-center"
              >
                Save Locally
              </button>
              {isKeySaved && (
                <button
                  type="button"
                  onClick={handleClearKey}
                  className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold rounded-lg px-3 py-2.5 text-xs transition"
                  title="Reset to default server key"
                >
                  Reset
                </button>
              )}
            </div>
          </form>

          <div className="border-t border-slate-200/60 pt-4 space-y-3">
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-[11px] text-slate-600 leading-relaxed shadow-sm">
              <strong className="text-slate-800 font-semibold block mb-1">🔐 Browser-Safe Storage</strong>
              Your custom API key is stored strictly in your browser's <code className="bg-slate-200/50 px-1 py-0.5 rounded font-mono text-[10px]">localStorage</code>. It is dynamically injected only into direct telemetry analyze headers and is never sent or persisted to our database server.
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-[11px] text-slate-600 leading-relaxed shadow-sm">
              <strong className="text-slate-800 font-semibold block mb-1">💡 Developer Instructions</strong>
              Don't have a developer key? You can get a free-tier Gemini API key instantly at the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">Google AI Studio Console</a>.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
