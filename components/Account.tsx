"use client";

import { useEffect, useState } from "react";
import type { Me } from "@/lib/types";
import { Icon } from "./Icons";

const PROVIDERS = [
  {
    id: "gemini" as const,
    title: "Google Gemini anahtarı",
    help: "aistudio.google.com → Get API key. Ücretsiz kotası var; Gemini modelleri menüde ayrı grup olarak çıkar.",
    placeholder: "AIza…",
  },
  {
    id: "openrouter" as const,
    title: "Kendi OpenRouter anahtarın",
    help: "openrouter.ai/keys. Eklersen TÜM modeller açılır ve ücret senin OpenRouter hesabından düşer.",
    placeholder: "sk-or-v1-…",
  },
];

// Ayarlar'daki "API anahtarlarım" bölümü
export function KeysSettings({ me, onChange }: { me: Me; onChange: (me: Me) => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  async function save(provider: "gemini" | "openrouter", key: string | null) {
    setBusy(provider);
    setMsg(null);
    try {
      const r = await fetch("/api/me/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Kaydedilemedi.");
      setDrafts((d) => ({ ...d, [provider]: "" }));
      setMsg({ id: provider, text: key ? "Anahtar doğrulandı ve şifreli kaydedildi." : "Anahtar silindi.", ok: true });
      onChange(j as Me);
    } catch (e) {
      setMsg({ id: provider, text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="keys">
      <div className="keys-title">API anahtarlarım</div>
      {!me.keysEnabled && (
        <p className="muted small">Anahtar ekleme kapalı: site sahibi sunucuda KEYS_SECRET ayarlamalı.</p>
      )}
      {me.keysEnabled &&
        PROVIDERS.map((p) => {
          const saved = me.keys[p.id];
          return (
            <div key={p.id} className="key-row">
              <div className="key-head">
                <b>{p.title}</b>
                {saved && <span className="badge own">Kayıtlı: {saved}</span>}
              </div>
              <div className="muted small">{p.help}</div>
              <div className="key-input">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={saved ? "Değiştirmek için yeni anahtar yapıştır" : p.placeholder}
                  value={drafts[p.id] || ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                />
                <button
                  className="btn primary"
                  disabled={busy !== null || !(drafts[p.id] || "").trim()}
                  onClick={() => save(p.id, (drafts[p.id] || "").trim())}
                >
                  {busy === p.id ? "Kontrol…" : "Kaydet"}
                </button>
                {saved && (
                  <button className="btn danger" disabled={busy !== null} onClick={() => save(p.id, null)}>
                    Sil
                  </button>
                )}
              </div>
              {msg?.id === p.id && <div className={msg.ok ? "ok-box" : "error-box"}>{msg.text}</div>}
            </div>
          );
        })}
    </div>
  );
}

type AdminUser = {
  id: string;
  username: string;
  isPro: boolean;
  isAdmin: boolean;
  ownKey: boolean;
  conversations: number;
  createdAt: number;
};

// Admin: kullanıcı listesi ve pro yetkisi anahtarı
export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Yüklenemedi");
        setUsers(j.users);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function toggle(u: AdminUser) {
    const next = !u.isPro;
    setUsers((list) => list && list.map((x) => (x.id === u.id ? { ...x, isPro: next } : x)));
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, isPro: next }),
    });
    if (!r.ok) {
      setUsers((list) => list && list.map((x) => (x.id === u.id ? { ...x, isPro: u.isPro } : x)));
      setError("Değişiklik kaydedilemedi.");
    }
  }

  const shown = (users || []).filter((u) => u.username.includes(q.toLowerCase().trim()));
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Kullanıcılar</h2>
          <button className="icon-btn" onClick={onClose} title="Kapat"><Icon.X /></button>
        </div>
        <p className="muted small">
          Pro kullanıcılar sitenin OpenRouter kredisiyle TÜM modelleri kullanabilir. Diğerleri sadece ücretsiz modelleri görür.
        </p>
        <div className="conv-search admin-search">
          <Icon.Search />
          <input placeholder="Kullanıcı ara" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error && <div className="error-box">{error}</div>}
        {!users && !error && <div className="muted small pad">Yükleniyor…</div>}
        <div className="admin-list">
          {shown.map((u) => (
            <div key={u.id} className="admin-row">
              <span className="avatar">{u.username.slice(0, 1).toUpperCase()}</span>
              <div className="admin-info">
                <b>{u.username}</b>
                <span className="muted small">
                  {u.conversations} sohbet · {new Date(u.createdAt).toLocaleDateString("tr-TR")}
                  {u.ownKey ? " · kendi OpenRouter anahtarı var" : ""}
                </span>
              </div>
              {u.isAdmin ? (
                <span className="tier-badge pro">Admin</span>
              ) : (
                <label className="switch" title={u.isPro ? "Pro yetkisini kaldır" : "Pro yap"}>
                  <input type="checkbox" checked={u.isPro} onChange={() => toggle(u)} />
                  <span className="slider" />
                  <span className="switch-label">{u.isPro ? "Pro" : "Ücretsiz"}</span>
                </label>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
