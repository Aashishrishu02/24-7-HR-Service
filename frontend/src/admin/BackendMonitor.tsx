import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, RefreshCw, Database, Server } from "lucide-react";

type HealthResult = {
  status?: string;
  service?: string;
  database?: string;
  checkedAt?: string;
};

export default function BackendMonitor() {
  const [url, setUrl] = useState(
    () => localStorage.getItem("vercel_backend_monitor_url") || ""
  );
  const [urlInput, setUrlInput] = useState(url);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState("");

  const checkBackend = useCallback(async () => {
    if (!url.trim()) return;

    setChecking(true);
    setError("");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);

    try {
      const baseUrl = url.trim().replace(/\/+$/, "");
      const response = await fetch(`${baseUrl}/api/health`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      setHttpStatus(response.status);

      const data = await response.json().catch(() => null);
      if (data) setHealth(data);

      if (!response.ok) {
        setError(data?.database === "disconnected"
          ? "Backend is reachable, but database connection failed."
          : `Backend returned HTTP ${response.status}.`);
      } else {
        setError("");
      }
    } catch (err) {
      setHealth(null);
      setHttpStatus(null);
      setError(err instanceof Error && err.name === "AbortError"
        ? "Request timed out after 10 seconds."
        : "Backend is unreachable. Check URL, deployment and CORS settings.");
    } finally {
      window.clearTimeout(timeout);
      setLastChecked(new Date().toISOString());
      setChecking(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    checkBackend();
    const timer = window.setInterval(checkBackend, 30000);
    return () => window.clearInterval(timer);
  }, [url, checkBackend]);

  const saveUrl = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = urlInput.trim().replace(/\/+$/, "");
    if (!cleaned) {
      setError("Please enter your Vercel backend URL.");
      return;
    }
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
        setError("Please enter a valid HTTPS URL.");
        return;
      }
      localStorage.setItem("vercel_backend_monitor_url", cleaned);
      setHealth(null);
      setError("");
      setUrl(cleaned);
    } catch {
      setError("Please enter a valid backend URL.");
    }
  };

  const backendOnline = health?.status === "ok" && httpStatus === 200;
  const databaseOnline = health?.database === "connected";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 p-3 text-[#C6A66B]">
            <Activity size={22} />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold">Vercel Backend Monitor</h3>
            <p className="mt-1 text-xs text-[#F1E9DA]/50">Automatic health check every 30 seconds</p>
          </div>
        </div>

        <form onSubmit={saveUrl} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="https://your-backend.vercel.app"
            className="min-w-0 flex-1 rounded-xl border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA] outline-none focus:border-[#C6A66B]"
          />
          <button type="submit" className="rounded-xl bg-[#C6A66B] px-5 py-3 text-xs font-bold text-[#171717] hover:bg-[#d8ba82]">
            Save Backend URL
          </button>
        </form>
        <p className="mt-2 text-[11px] text-[#F1E9DA]/40">
          Enter the separate Vercel backend project's deployment URL. This does not change your frontend API connection.
        </p>
      </div>

      {!url ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-300">
          Add your Vercel backend URL above to start monitoring.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
              <div className="mb-3 flex items-center gap-2 text-[#F1E9DA]/60">
                <Server size={17} /> <span className="font-mono text-xs uppercase">Backend status</span>
              </div>
              <div className="flex items-center gap-2">
                {backendOnline
                  ? <CheckCircle2 className="text-emerald-400" size={22} />
                  : <XCircle className="text-red-400" size={22} />}
                <span className={backendOnline ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                  {checking && !health ? "Checking..." : backendOnline ? "Online" : "Offline / Error"}
                </span>
              </div>
              <p className="mt-2 text-xs text-[#F1E9DA]/40">HTTP: {httpStatus ?? "—"}</p>
            </div>

            <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
              <div className="mb-3 flex items-center gap-2 text-[#F1E9DA]/60">
                <Database size={17} /> <span className="font-mono text-xs uppercase">Database status</span>
              </div>
              <div className="flex items-center gap-2">
                {databaseOnline
                  ? <CheckCircle2 className="text-emerald-400" size={22} />
                  : <XCircle className="text-red-400" size={22} />}
                <span className={databaseOnline ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                  {databaseOnline ? "Connected" : "Disconnected / Unknown"}
                </span>
              </div>
              <p className="mt-2 text-xs text-[#F1E9DA]/40">PostgreSQL connectivity</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-[#332f2a] bg-[#201d1a] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-[#F1E9DA]/50">Last checked</p>
                <p className="mt-1 font-mono text-sm">{lastChecked ? new Date(lastChecked).toLocaleString("en-IN") : "Not checked yet"}</p>
                <p className="mt-2 break-all text-xs text-[#F1E9DA]/40">{url}/api/health</p>
              </div>
              <button
                type="button"
                onClick={checkBackend}
                disabled={checking}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#C6A66B]/40 px-4 py-2.5 text-xs font-bold text-[#C6A66B] hover:bg-[#C6A66B]/10 disabled:opacity-50"
              >
                <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
                {checking ? "Checking..." : "Check now"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
