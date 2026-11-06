"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Giriş başarısız.");
      location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Çoklu AI Sohbet</h1>
        <p className="muted">Devam etmek için erişim şifresini gir.</p>
        <input
          type="password"
          autoFocus
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error-box">{error}</div>}
        <button className="btn primary" disabled={busy || !password}>
          {busy ? "Kontrol ediliyor…" : "Giriş yap"}
        </button>
      </form>
    </div>
  );
}
