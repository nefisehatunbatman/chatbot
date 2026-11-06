"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelInfo, Recommended, Tier } from "@/lib/types";
import { Icon } from "./Icons";

type Filter = "all" | "free" | "openai" | "anthropic" | "google" | "image";

const perMillion = (p: number) => {
  const v = p * 1_000_000;
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);
};
const fmtCtx = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}K`;

function ModelRow({ m, selected, onPick }: { m: ModelInfo; selected: boolean; onPick: () => void }) {
  return (
    <button className={"mp-item" + (selected ? " sel" : "")} onClick={onPick}>
      <div className="mp-item-top">
        <span className="mp-item-name">{m.name}</span>
        {m.source === "gemini" ? (
          <span className="badge own">Senin Gemini anahtarın</span>
        ) : m.source === "own" ? (
          <span className={"badge own" + (m.free ? " free" : "")}>{m.free ? "Ücretsiz" : "Senin OpenRouter hesabın"}</span>
        ) : m.free ? (
          <span className="badge free">Ücretsiz</span>
        ) : (
          <span className="badge paid">Site kredisi</span>
        )}
        {m.image && <span className="badge">Görsel</span>}
      </div>
      <div className="mp-item-sub">
        {m.id}
        {m.context ? ` · ${fmtCtx(m.context)} bağlam` : ""}
        {m.source !== "gemini" && !m.free && (m.promptPrice || m.completionPrice)
          ? ` · $${perMillion(m.promptPrice)} / $${perMillion(m.completionPrice)} (1M token girdi/çıktı)`
          : ""}
      </div>
    </button>
  );
}

export default function ModelPicker({
  models, recommended, tier, value, onChange, error,
}: {
  models: ModelInfo[];
  recommended: Recommended;
  tier: Tier;
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

  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const current = byId.get(value);
  const freeCount = useMemo(() => models.filter((m) => m.free).length, [models]);
  const recFree = recommended.free.map((id) => byId.get(id)).filter((m): m is ModelInfo => !!m);
  const recPaid = recommended.paid.map((id) => byId.get(id)).filter((m): m is ModelInfo => !!m);
  const geminiOwn = models.filter((m) => m.source === "gemini");

  const list = useMemo(() => {
    const ql = q.toLocaleLowerCase("tr").trim();
    return models.filter((m) => {
      if (filter === "free" && !m.free) return false;
      if (filter === "image" && !m.image) return false;
      if (filter === "google" && !(m.id.startsWith("google/") || m.source === "gemini")) return false;
      if ((filter === "openai" || filter === "anthropic") && !m.id.startsWith(filter + "/")) return false;
      if (ql && !m.name.toLocaleLowerCase("tr").includes(ql) && !m.id.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [models, q, filter]);

  const showRecommended = filter === "all" && !q.trim() && (recFree.length > 0 || recPaid.length > 0 || geminiOwn.length > 0);
  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

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
      <button
        className="mp-btn"
        onClick={() => {
          if (!open) {
            setQ("");
            setFilter("all");
          }
          setOpen((o) => !o);
        }}
        title="Model seç"
      >
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

            {showRecommended && (
              <>
                {recFree.length > 0 && (
                  <>
                    <div className="mp-section">⭐ Önerilen · ücretsiz, hiç kredi harcamaz</div>
                    {recFree.map((m) => <ModelRow key={"rf" + m.id} m={m} selected={m.id === value} onPick={() => pick(m.id)} />)}
                  </>
                )}
                {recPaid.length > 0 && (
                  <>
                    <div className="mp-section">⭐ Önerilen · en iyi ChatGPT ve Claude (kredi kullanır)</div>
                    {recPaid.map((m) => <ModelRow key={"rp" + m.id} m={m} selected={m.id === value} onPick={() => pick(m.id)} />)}
                  </>
                )}
                {geminiOwn.length > 0 && (
                  <>
                    <div className="mp-section">🔑 Kendi Gemini anahtarınla</div>
                    {geminiOwn.slice(0, 6).map((m) => <ModelRow key={"g" + m.id} m={m} selected={m.id === value} onPick={() => pick(m.id)} />)}
                  </>
                )}
                <div className="mp-section">{tier === "free" ? "Kullanabileceğin tüm modeller" : "Tüm modeller"}</div>
              </>
            )}

            {tier === "free" && showRecommended && (
              <div className="mp-hint">
                Hesabında sadece ücretsiz modeller açık. Daha fazlası için admin'den pro yetkisi iste ya da Ayarlar'dan kendi anahtarını ekle.
              </div>
            )}
            {filter === "anthropic" && !q.trim() && models.length > 0 && (
              <div className="mp-hint">
                {tier === "free"
                  ? "OpenRouter'da ücretsiz Claude modeli yok. Claude için pro yetkisi veya kendi OpenRouter anahtarın gerekir."
                  : "Claude modellerinin hiçbiri ücretsiz değil; hepsi kredi kullanır."}
              </div>
            )}

            {list.map((m) => <ModelRow key={m.id} m={m} selected={m.id === value} onPick={() => pick(m.id)} />)}
            {models.length > 0 && list.length === 0 && <div className="muted small pad">Sonuç yok</div>}
          </div>
        </div>
      )}
    </div>
  );
}
