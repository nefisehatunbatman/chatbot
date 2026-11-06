"use client";

import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { username, password } : { username, password, inviteCode }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "İşlem başarısız.");
      location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const reg = mode === "register";
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Çoklu AI Sohbet</h1>
        <div className="tabs">
          <button type="button" className={"tab" + (!reg ? " on" : "")} onClick={() => { setMode("login"); setError(null); }}>
            Giriş yap
          </button>
          <button type="button" className={"tab" + (reg ? " on" : "")} onClick={() => { setMode("register"); setError(null); }}>
            Kayıt ol
          </button>
        </div>
        <input
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          placeholder="Kullanıcı adı"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          autoComplete={reg ? "new-password" : "current-password"}
          placeholder={reg ? "Şifre (en az 8 karakter)" : "Şifre"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {reg && (
          <input
            autoComplete="off"
            placeholder="Davet kodu"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
        )}
        {error && <div className="error-box">{error}</div>}
        <button className="btn primary" disabled={busy || !username || !password || (reg && !inviteCode)}>
          {busy ? "Bekle…" : reg ? "Hesap oluştur" : "Giriş yap"}
        </button>
        {reg && <p className="muted small">Davet kodunu site sahibinden alabilirsin.</p>}
      </form>
    </div>
  );
}
