import { useEffect, useRef, useState } from "react";
import { getServerBase, setServerBase, fetchConfig, updateConfig } from "../api";

interface Props {
  onClose: () => void;
  onSave: () => void;
}

export function Settings({ onClose, onSave }: Props) {
  const [serverUrl, setServerUrl] = useState(getServerBase);
  const [ollamaHost, setOllamaHost] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    fetchConfig().then((c) => setOllamaHost(c.ollamaHost)).catch(() => {});
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      setServerBase(serverUrl);
      if (ollamaHost.trim()) {
        const res = await updateConfig(ollamaHost.trim());
        setStatus(
          res.ok
            ? { ok: true, msg: `Connected to Ollama at ${res.ollamaHost}` }
            : { ok: false, msg: `Saved — but Ollama at ${res.ollamaHost} is not reachable yet` },
        );
      }
      onSave();
      if (!ollamaHost.trim() || (await updateConfig(ollamaHost.trim())).ok) {
        onClose();
      }
    } catch (e) {
      setStatus({ ok: false, msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setServerBase("");
    setServerUrl("");
    onSave();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#30363d] bg-[#161b22] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#e6edf3]">Settings</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#e6edf3]">✕</button>
        </div>

        <div className="space-y-5">
          {/* Ollama / Qwen host */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#8b949e]">
              Ollama server URL
            </label>
            <input
              ref={firstRef}
              type="url"
              value={ollamaHost}
              onChange={(e) => setOllamaHost(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              placeholder="http://192.168.1.5:11434"
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] outline-none focus:border-[#58a6ff]"
            />
            <p className="mt-1.5 text-xs text-[#484f58]">
              The machine running <code className="text-[#8b949e]">ollama serve</code> with Qwen. Must be reachable from
              this server. Make sure Ollama is started with{" "}
              <code className="text-[#8b949e]">OLLAMA_HOST=0.0.0.0 ollama serve</code> for LAN access.
            </p>
          </div>

          {/* AlphaAI backend URL */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#8b949e]">
              AlphaAI backend URL
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              placeholder="http://localhost:8787  (leave blank for same origin)"
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] outline-none focus:border-[#58a6ff]"
            />
            <p className="mt-1.5 text-xs text-[#484f58]">
              Only change if this web UI is served from a different host than the AlphaAI server.
            </p>
          </div>
        </div>

        {status && (
          <div
            className={`mt-4 rounded-lg px-3 py-2 text-xs ${
              status.ok
                ? "bg-green-950/50 text-green-400"
                : "bg-orange-950/50 text-orange-400"
            }`}
          >
            {status.msg}
          </div>
        )}

        <div className="mt-6 flex justify-between gap-3">
          <button
            onClick={reset}
            className="rounded-lg border border-[#30363d] px-4 py-2 text-sm text-[#8b949e] hover:border-[#58a6ff] hover:text-[#e6edf3]"
          >
            Reset to default
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-[#30363d] px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3]"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white hover:bg-[#388bfd] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & reconnect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
