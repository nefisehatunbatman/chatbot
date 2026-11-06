"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import ModelPicker from "./ModelPicker";
import { Icon } from "./Icons";
import type { AttachmentMeta, ConvSummary, Me, ModelInfo, Msg, PendingAttachment, Recommended, Theme } from "@/lib/types";
import { ACCEPT, formatSize, uploadAttachment } from "@/lib/files";
import { readSSE } from "@/lib/sse";

const tmpId = () => "tmp-" + Math.random().toString(36).slice(2);

// fetch sarmalayıcı: oturum düşerse giriş ekranına yollar
async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (r.status === 401) {
    location.href = "/login";
    throw new Error("Oturum kapalı");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Hata (${r.status})`);
  return j as T;
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  if (!text) return null;
  return (
    <button
      className="icon-btn sm"
      title="Kopyala"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? <Icon.Check /> : <Icon.Copy />}
    </button>
  );
}

const kindLabel = (k: string) => (k === "pdf" ? "PDF" : k === "image" ? "Görsel" : "Metin");

// Gönderilmiş ek: görsel önizleme veya dosya kartı, ikisinde de indirme butonu
function SentAttachment({ a }: { a: AttachmentMeta }) {
  const href = `/api/files/${a.id}`;
  const dl = `${href}?download=1`;
  if (a.kind === "image") {
    return (
      <div className="att att-img" title={a.name}>
        <a href={href} target="_blank" rel="noopener">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${href}?variant=model`} alt={a.name} loading="lazy" />
        </a>
        <a className="att-dl" href={dl} download={a.name} title="İndir"><Icon.Download /></a>
      </div>
    );
  }
  return (
    <div className="att" title={a.name}>
      <span className="att-icon"><Icon.File /></span>
      <a className="att-meta" href={href} target="_blank" rel="noopener">
        <span className="att-name">{a.name}</span>
        <span className="att-kind">{kindLabel(a.kind)} · {formatSize(a.size)}</span>
      </a>
      <a className="icon-btn sm" href={dl} download={a.name} title="İndir"><Icon.Download /></a>
    </div>
  );
}

function PendingChip({ p, onRemove }: { p: PendingAttachment; onRemove: () => void }) {
  const uploading = !p.meta && !p.error;
  return (
    <div className={"att" + (p.previewUrl ? " att-img" : "") + (p.error ? " att-err" : "")} title={p.error || p.name}>
      {p.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.previewUrl} alt={p.name} />
      ) : (
        <>
          <span className="att-icon"><Icon.File /></span>
          <span className="att-meta">
            <span className="att-name">{p.name}</span>
            <span className="att-kind">{p.error ? "Yüklenemedi" : `${kindLabel(p.kind)} · ${formatSize(p.size)}`}</span>
          </span>
        </>
      )}
      {uploading && (
        <div className="att-progress"><span style={{ width: `${Math.max(5, p.progress)}%` }} /></div>
      )}
      <button className="att-x" onClick={onRemove} title="Kaldır"><Icon.X /></button>
    </div>
  );
}

export default function Chat({ initialMe }: { initialMe: Me }) {
  const [me] = useState<Me>(initialMe);
  const [convs, setConvs] = useState<ConvSummary[]>([]);
  const [convsLoaded, setConvsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [recommended, setRecommended] = useState<Recommended>({ free: [], paid: [] });
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(initialMe.user.settings.model || "");
  const [system, setSystem] = useState(initialMe.user.settings.system || "");
  const [theme, setTheme] = useState<Theme>(initialMe.user.settings.theme || "system");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const loadToken = useRef(0);
  const settingsReady = useRef(false);

  // --- İlk yükleme ---
  const refreshConvs = useCallback(async () => {
    try {
      const j = await api<{ conversations: ConvSummary[] }>("/api/conversations");
      setConvs(j.conversations);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setConvsLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshConvs();
    api<{ models: ModelInfo[]; recommended: Recommended; defaultModel: string }>("/api/models")
      .then((j) => {
        setModels(j.models);
        setRecommended(j.recommended);
        setModel((cur) => (cur && j.models.some((m) => m.id === cur) ? cur : j.defaultModel || j.models[0]?.id || cur));
      })
      .catch((e) => setModelsError(e.message));
  }, [refreshConvs]);

  // Ayarlar sunucuda, kullanıcıya özel saklanır (her cihazda aynı)
  useEffect(() => {
    if (!settingsReady.current) {
      settingsReady.current = true;
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { system, theme, model } }),
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [system, theme, model]);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

  const currentModel = models.find((m) => m.id === model);
  const modelName = (id?: string) => (id ? models.find((m) => m.id === id)?.name || id : "");

  // --- Kaydırma ve metin kutusu ---
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, [input, activeId]);

  // --- Sohbet açma ---
  async function loadConv(id: string, opts: { quiet?: boolean } = {}) {
    const token = ++loadToken.current;
    if (!opts.quiet) setLoadingConv(true);
    try {
      const j = await api<{ messages: Msg[] }>(`/api/conversations/${id}`);
      if (token === loadToken.current) setMessages(j.messages);
    } catch (e) {
      if (token === loadToken.current) setNotice((e as Error).message);
    } finally {
      if (token === loadToken.current) setLoadingConv(false);
    }
  }

  function openConv(id: string) {
    if (streaming) stop();
    setActiveId(id);
    setMessages([]);
    setEditingId(null);
    setSidebarOpen(false);
    stickRef.current = true;
    loadConv(id);
  }

  // --- Dosya ekleme ---
  async function addFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      const key = tmpId();
      const isImg = f.type.startsWith("image/");
      const item: PendingAttachment = {
        key,
        name: f.name || "dosya",
        kind: isImg ? "image" : f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : "text",
        size: f.size,
        previewUrl: isImg ? URL.createObjectURL(f) : undefined,
        progress: 0,
      };
      setPending((p) => [...p, item]);
      const patch = (x: Partial<PendingAttachment>) => setPending((p) => p.map((it) => (it.key === key ? { ...it, ...x } : it)));
      uploadAttachment(f, me, (pct) => patch({ progress: pct }))
        .then((meta) => patch({ meta, progress: 100 }))
        .catch((e) => {
          patch({ error: (e as Error).message });
          setNotice((e as Error).message);
        });
    }
  }

  function removePending(p: PendingAttachment) {
    setPending((list) => list.filter((x) => x.key !== p.key));
    if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    if (p.meta) fetch(`/api/files/${p.meta.id}`, { method: "DELETE" }).catch(() => {});
  }

  // --- Modelden cevap alma ---
  async function runStream(body: Record<string, unknown>, optimistic: Msg[]) {
    const asstId = tmpId();
    const usedModel = model;
    setMessages([...optimistic, { id: asstId, role: "assistant", content: "", model: usedModel }]);
    setStreaming(true);
    stickRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;

    let content = "";
    let reasoning = "";
    let last = 0;
    let convId = (body.conversationId as string) || "";
    let aborted = false;
    const patch = (x: Partial<Msg>) => setMessages((ms) => ms.map((m) => (m.id === asstId ? { ...m, ...x } : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: usedModel, imageSupport: currentModel ? currentModel.image : true }),
        signal: ac.signal,
      });
      if (res.status === 401) {
        location.href = "/login";
        return;
      }
      convId = res.headers.get("X-Conversation-Id") || convId;
      if (convId && !body.conversationId) {
        setActiveId(convId);
        refreshConvs();
      }
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Sunucu hatası (${res.status})`);
      }
      await readSSE(res.body, (d) => {
        if (d.content) content += d.content;
        if (d.reasoning) reasoning += d.reasoning;
        const now = performance.now();
        if (now - last > 40) {
          last = now;
          patch({ content, reasoning: reasoning || undefined });
        }
      });
      patch({ content, reasoning: reasoning || undefined });
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") aborted = true;
      else patch({ content, error: err.message || "Bilinmeyen hata" });
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (convId) {
        // Sunucunun kaydettiği hâli yükle (durdurulduysa kaydın bitmesini kısa süre bekle)
        if (aborted) await new Promise((r) => setTimeout(r, 900));
        await loadConv(convId, { quiet: true });
        refreshConvs();
      }
    }
  }

  function checkImages(hasImage: boolean) {
    if (hasImage && currentModel && !currentModel.image) {
      setNotice(`"${currentModel.name}" görsel desteklemiyor. Model menüsünden "Görsel destekli" filtresiyle bir model seç.`);
      return false;
    }
    return true;
  }

  async function send() {
    const text = input.trim();
    if (streaming) return;
    if (pending.some((p) => !p.meta && !p.error)) {
      setNotice("Dosyalar yüklenirken bekle…");
      return;
    }
    const ready = pending.filter((p) => p.meta).map((p) => p.meta!);
    if (!text && ready.length === 0) return;
    if (!model) {
      setNotice("Önce bir model seç.");
      return;
    }
    if (!checkImages(ready.some((a) => a.kind === "image"))) return;

    const userMsg: Msg = { id: tmpId(), role: "user", content: text, attachments: ready.length ? ready : undefined };
    const base = activeId ? messages : [];
    pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setInput("");
    setPending([]);
    setNotice(null);
    await runStream(
      { mode: "send", conversationId: activeId || undefined, text, attachmentIds: ready.map((a) => a.id) },
      [...base, userMsg]
    );
  }

  function stop() {
    abortRef.current?.abort();
  }

  function regenerate() {
    if (!activeId || streaming) return;
    let lastUser = -1;
    messages.forEach((m, i) => m.role === "user" && (lastUser = i));
    if (lastUser < 0) return;
    if (!checkImages(!!messages[lastUser].attachments?.some((a) => a.kind === "image"))) return;
    runStream({ mode: "regenerate", conversationId: activeId }, messages.slice(0, lastUser + 1));
  }

  function saveEdit(msgId: string) {
    if (!activeId || streaming) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const orig = messages[idx];
    const text = editText.trim();
    if (!text && !orig.attachments?.length) return;
    setEditingId(null);
    runStream(
      { mode: "edit", conversationId: activeId, editMessageId: msgId, text },
      [...messages.slice(0, idx), { ...orig, content: text }]
    );
  }

  function newChat() {
    if (streaming) stop();
    loadToken.current++;
    setActiveId(null);
    setMessages([]);
    setInput("");
    setEditingId(null);
    setSidebarOpen(false);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function renameConv(id: string) {
    const c = convs.find((x) => x.id === id);
    const t = prompt("Sohbet adı", c?.title || "");
    if (!t || !t.trim()) return;
    try {
      await api(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t.trim() }),
      });
      setConvs((cs) => cs.map((x) => (x.id === id ? { ...x, title: t.trim() } : x)));
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function deleteConv(id: string) {
    if (!confirm("Bu sohbet ve ekleri kalıcı olarak silinsin mi?")) return;
    try {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      setConvs((cs) => cs.filter((c) => c.id !== id));
      if (id === activeId) newChat();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function deleteAll() {
    if (!confirm("TÜM sohbetlerin ve eklerin kalıcı olarak silinsin mi?")) return;
    if (streaming) stop();
    for (const c of convs) {
      await api(`/api/conversations/${c.id}`, { method: "DELETE" }).catch(() => {});
    }
    setConvs([]);
    newChat();
    setSettingsOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/login";
  }

  const q = convSearch.toLocaleLowerCase("tr");
  const filteredConvs = convs.filter((c) => c.title.toLocaleLowerCase("tr").includes(q));
  const activeTitle = convs.find((c) => c.id === activeId)?.title || "";
  const lastAsstId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const uploading = pending.some((p) => !p.meta && !p.error);
  const canSend = !uploading && (!!input.trim() || pending.some((p) => p.meta));
  const showChat = !!activeId || messages.length > 0;

  const composer = (
    <div className="composer-wrap">
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <button className="icon-btn sm" onClick={() => setNotice(null)} title="Kapat"><Icon.X /></button>
        </div>
      )}
      <div className="composer">
        {pending.length > 0 && (
          <div className="pending">
            {pending.map((p) => <PendingChip key={p.key} p={p} onRemove={() => removePending(p)} />)}
          </div>
        )}
        <textarea
          ref={taRef}
          value={input}
          rows={1}
          placeholder={showChat ? "Yanıtla…" : "Bir mesaj yaz…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
        />
        <div className="composer-bar">
          <button className="icon-btn" title="Dosya veya fotoğraf ekle" onClick={() => fileRef.current?.click()}>
            <Icon.Paperclip />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <ModelPicker models={models} recommended={recommended} value={model} onChange={setModel} error={modelsError} />
          <div className="spacer" />
          {streaming ? (
            <button className="send-btn" title="Durdur" onClick={stop}><Icon.Stop /></button>
          ) : (
            <button className="send-btn" title={uploading ? "Dosyalar yükleniyor…" : "Gönder"} disabled={!canSend} onClick={send}>
              <Icon.ArrowUp />
            </button>
          )}
        </div>
      </div>
      <div className="disclaimer">Yapay zeka hata yapabilir. Önemli bilgileri kontrol et.</div>
    </div>
  );

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      <aside className={"sidebar" + (sidebarOpen ? " open" : "")}>
        <div className="sidebar-head">
          <span className="brand"><Icon.Sparkle /> Çoklu AI</span>
          <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(false)} title="Kapat"><Icon.X /></button>
        </div>
        <button className="new-chat" onClick={newChat}><Icon.Plus /> Yeni sohbet</button>
        <div className="conv-search">
          <Icon.Search />
          <input placeholder="Sohbetlerde ara" value={convSearch} onChange={(e) => setConvSearch(e.target.value)} />
        </div>
        <div className="conv-label">Sohbetler</div>
        <div className="conv-list">
          {!convsLoaded && <div className="muted small pad">Yükleniyor…</div>}
          {convsLoaded && filteredConvs.length === 0 && <div className="muted small pad">Henüz sohbet yok</div>}
          {filteredConvs.map((c) => (
            <div key={c.id} className={"conv-item" + (c.id === activeId ? " active" : "")} onClick={() => openConv(c.id)}>
              <span className="conv-title">{c.title}</span>
              <span className="conv-actions">
                <button className="icon-btn sm" title="Yeniden adlandır" onClick={(e) => { e.stopPropagation(); renameConv(c.id); }}>
                  <Icon.Pencil />
                </button>
                <button className="icon-btn sm" title="Sil" onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}>
                  <Icon.Trash />
                </button>
              </span>
            </div>
          ))}
        </div>
        <button className="sidebar-foot" onClick={() => setSettingsOpen(true)}>
          <span className="avatar">{me.user.username.slice(0, 1).toUpperCase()}</span>
          <span className="foot-name">{me.user.username}</span>
          <Icon.Settings />
        </button>
      </aside>
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} title="Menü"><Icon.Menu /></button>
          <div className="topbar-title">{showChat ? activeTitle : ""}</div>
          <button className="icon-btn mobile-only" onClick={newChat} title="Yeni sohbet"><Icon.Plus /></button>
        </header>

        {!showChat ? (
          <div className="empty">
            <h1 className="greeting">
              <span className="greet-mark"><Icon.Sparkle /></span> Merhaba {me.user.username}, bugün nasıl yardımcı olabilirim?
            </h1>
            {composer}
          </div>
        ) : (
          <>
            <div className="messages" ref={scrollRef} onScroll={onScroll}>
              <div className="messages-inner">
                {loadingConv && messages.length === 0 && <div className="muted small pad center">Sohbet yükleniyor…</div>}
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="msg user">
                      {m.attachments && (
                        <div className="msg-atts">{m.attachments.map((a) => <SentAttachment key={a.id} a={a} />)}</div>
                      )}
                      {editingId === m.id ? (
                        <div className="edit-box">
                          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus rows={3} />
                          <div className="edit-actions">
                            <button className="btn ghost" onClick={() => setEditingId(null)}>İptal</button>
                            <button className="btn primary" onClick={() => saveEdit(m.id)} disabled={streaming}>Kaydet ve gönder</button>
                          </div>
                        </div>
                      ) : (
                        m.content && <div className="bubble">{m.content}</div>
                      )}
                      {editingId !== m.id && (
                        <div className="msg-actions">
                          <CopyBtn text={m.content} />
                          {!streaming && !m.id.startsWith("tmp-") && (
                            <button className="icon-btn sm" title="Düzenle" onClick={() => { setEditingId(m.id); setEditText(m.content); }}>
                              <Icon.Pencil />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div key={m.id} className="msg assistant">
                      {m.reasoning && (
                        <details className="reasoning">
                          <summary>Düşünme süreci</summary>
                          <div className="reasoning-body">{m.reasoning}</div>
                        </details>
                      )}
                      {m.content ? (
                        <Markdown text={m.content} />
                      ) : !m.error && streaming && m.id === lastAsstId ? (
                        <div className="typing"><span /><span /><span /></div>
                      ) : null}
                      {m.error && <div className="error-box">{m.error}</div>}
                      {!(streaming && m.id === lastAsstId) && (
                        <div className="msg-actions">
                          <CopyBtn text={m.content} />
                          {m.id === lastAsstId && (
                            <button className="icon-btn sm" title="Yeniden oluştur (seçili modelle)" onClick={regenerate}>
                              <Icon.Refresh />
                            </button>
                          )}
                          <span className="model-tag">{modelName(m.model)}</span>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
            {composer}
          </>
        )}
      </main>

      {settingsOpen && (
        <div className="modal-scrim" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Ayarlar</h2>
              <button className="icon-btn" onClick={() => setSettingsOpen(false)} title="Kapat"><Icon.X /></button>
            </div>
            <p className="muted small">Giriş yapan: <b>{me.user.username}</b></p>
            <label className="field">
              <span>Sistem talimatı (her sohbete eklenir)</span>
              <textarea
                rows={5}
                value={system}
                placeholder="Örn: Kısa ve Türkçe cevap ver."
                onChange={(e) => setSystem(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Tema</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
                <option value="system">Sistem</option>
                <option value="light">Açık</option>
                <option value="dark">Koyu</option>
              </select>
            </label>
            <p className="muted small">
              Sohbetlerin ve eklerin hesabına kayıtlı; telefondan veya başka bir bilgisayardan girdiğinde de görünür.
            </p>
            <div className="modal-actions">
              <button className="btn danger" onClick={deleteAll}>Tüm sohbetleri sil</button>
              <div className="spacer" />
              <button className="btn ghost" onClick={logout}><Icon.Logout /> Çıkış yap</button>
            </div>
          </div>
        </div>
      )}

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-box"><Icon.Paperclip /> Dosyaları buraya bırak</div>
        </div>
      )}
    </div>
  );
}
