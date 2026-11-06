"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelInfo } from "@/lib/types";
import { Icon } from "./Icons";

type Filter = "all" | "free" | "openai" | "anthropic" | "google" | "image";

const perMillion = (p: number) => {
  const v = p * 1_000_000;
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);
};
const fmtCtx = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}K`;

export default function ModelPicker({
  models, value, onChange, error,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = models.find((m) => m.id === value);
  const freeCount = useMemo(() => models.filter((m) => m.free).length, [models]);

  const list = useMemo(() => {
    const ql = q.toLocaleLowerCase("tr").trim();
    return models.filter((m) => {
      if (filter === "free" && !m.free) return false;
      if (filter === "image" && !m.image) return false;
      if ((filter === "openai" || filter === "anthropic" || filter === "google") && !m.id.startsWith(filter + "/")) return false;
      if (ql && !m.name.toLocaleLowerCase("tr").includes(ql) && !m.id.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [models, q, filter]);

  const chips: [Filter, string][] = [
    ["all", `Tümü (${models.length})`],
    ["free", `Ücretsiz (${freeCount})`],
    ["openai", "ChatGPT"],
    ["anthropic", "Claude"],
    ["google", "Gemini"],
    ["image", "Görsel destekli"],
  ];

  return (
    <div className="mp" ref={ref}>
      <button className="mp-btn" onClick={() => setOpen((o) => !o)} title="Model seç">
        <span className="mp-name">{current?.name || value}</span>
        {current?.free && <span className="badge free">Ücretsiz</span>}
        <Icon.ChevronDown />
      </button>
      {open && (
        <div className="mp-pop" role="listbox">
          <div className="mp-search">
            <Icon.Search />
            <input
              autoFocus
              placeholder={`${models.length} model içinde ara…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="mp-chips">
            {chips.map(([k, label]) => (
              <button key={k} className={"chip" + (filter === k ? " on" : "")} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="mp-list">
            {error && <div className="muted small pad">{error}</div>}
            {!error && models.length === 0 && <div className="muted small pad">Modeller yükleniyor…</div>}
            {list.map((m) => (
              <button
                key={m.id}
                className={"mp-item" + (m.id === value ? " sel" : "")}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <div className="mp-item-top">
                  <span className="mp-item-name">{m.name}</span>
                  {m.free && <span className="badge free">Ücretsiz</span>}
                  {m.image && <span className="badge">Görsel</span>}
                </div>
                <div className="mp-item-sub">
                  {m.id}
                  {m.context ? ` · ${fmtCtx(m.context)} bağlam` : ""}
                  {!m.free && (m.promptPrice || m.completionPrice)
                    ? ` · $${perMillion(m.promptPrice)} / $${perMillion(m.completionPrice)} (1M token girdi/çıktı)`
                    : ""}
                </div>
              </button>
            ))}
            {models.length > 0 && list.length === 0 && <div className="muted small pad">Sonuç yok</div>}
          </div>
        </div>
      )}
    </div>
  );
}
