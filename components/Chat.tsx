"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import ModelPicker from "./ModelPicker";
import { Icon } from "./Icons";
import type { Attachment, Conv, ModelInfo, Msg, Theme } from "@/lib/types";
import { ACCEPT, fileToAttachment, formatSize } from "@/lib/files";
import { toApiMessages } from "@/lib/api-messages";
import { readSSE } from "@/lib/sse";
import { loadState, saveState } from "@/lib/storage";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function makeTitle(text: string, atts: Attachment[]) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t) return t.length > 48 ? t.slice(0, 48) + "…" : t;
  return atts[0]?.name || "Yeni sohbet";
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

function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  return (
    <div className={"att" + (a.kind === "image" ? " att-img" : "")} title={a.name}>
      {a.kind === "image" && a.dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.dataUrl} alt={a.name} />
      ) : (
        <>
          <span className="att-icon"><Icon.File /></span>
          <span className="att-meta">
            <span className="att-name">{a.name}</span>
            <span className="att-kind">
              {a.kind === "pdf" ? "PDF" : a.kind === "image" ? "Görsel" : "Metin"} · {formatSize(a.size)}
            </span>
          </span>
        </>
      )}
      {onRemove && (
        <button className="att-x" onClick={onRemove} title="Kaldır"><Icon.X /></button>
      )}
    </div>
  );
}

export default function Chat() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [model, setModel] = useState<string>("openai/gpt-4o-mini");
  const [system, setSystem] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loaded, setLoaded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const savedModelRef = useRef<string | null>(null);
  const storageWarned = useRef(false);

  // --- Yükleme / kaydetme ---
  useEffect(() => {
    const s = loadState();
    if (s) {
      setConvs(s.convs || []);
      setActiveId(s.activeId ?? null);
      if (s.model) {
        setModel(s.model);
        savedModelRef.current = s.model;
      }
      setSystem(s.system || "");
      setTheme(s.theme || "system");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const r = saveState({ convs, activeId, model, system, theme });
      if (r !== "ok" && !storageWarned.current) {
        storageWarned.current = true;
        setNotice("Tarayıcı depolaması doldu. Eski eklerin içerikleri kaydedilmedi; eski sohbetleri silmeyi düşünebilirsin.");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [convs, activeId, model, system, theme, loaded]);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    fetch("/api/models")
      .then(async (r) => {
        if (r.status === 401) {
          location.href = "/login";
          return;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Modeller alınamadı");
        const list: ModelInfo[] = j.models;
        setModels(list);
        if (!savedModelRef.current) {
          const def = list.find((m) => m.id === j.defaultModel) ? j.defaultModel : list[0]?.id;
          if (def) setModel(def);
        }
      })
      .catch((e) => setModelsError(e.message));
  }, []);

  const active = convs.find((c) => c.id === activeId) || null;
  const currentModel = models.find((m) => m.id === model);
  const modelName = (id?: string) => (id ? models.find((m) => m.id === id)?.name || id : "");

  // --- Otomatik kaydırma ve metin kutusu boyutu ---
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [active?.messages]);

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

  const updateConv = useCallback((id: string, fn: (c: Conv) => Conv) => {
    setConvs((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  async function addFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      try {
        const a = await fileToAttachment(f);
        setPending((p) => [...p, a]);
      } catch (e) {
        setNotice((e as Error).message);
      }
    }
  }

  // --- Modelden cevap alma ---
  async function runCompletion(convId: string, history: Msg[]) {
    const asstId = uid();
    const usedModel = model;
    updateConv(convId, (c) => ({
      ...c,
      messages: [...history, { id: asstId, role: "assistant", content: "", model: usedModel }],
      updatedAt: Date.now(),
    }));
    setStreaming(true);
    stickRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;

    let content = "";
    let reasoning = "";
    let last = 0;
    const flush = () =>
      updateConv(convId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === asstId ? { ...m, content, reasoning: reasoning || undefined } : m
        ),
      }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: usedModel,
          system: system.trim() || undefined,
          messages: toApiMessages(history, currentModel ? currentModel.image : true),
        }),
        signal: ac.signal,
      });
      if (res.status === 401) {
        location.href = "/login";
        return;
      }
      if (res.status === 413) throw new Error("Gönderilen ekler çok büyük. Daha az veya daha küçük dosya dene.");
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
          flush();
        }
      });
      flush();
      if (!content && !reasoning) throw new Error("Model boş yanıt döndürdü. Tekrar dene veya başka model seç.");
    } catch (e) {
      flush();
      const err = e as Error;
      if (err.name !== "AbortError") {
        updateConv(convId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === asstId ? { ...m, error: err.message || "Bilinmeyen hata" } : m)),
        }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function checkImages(atts: Attachment[]) {
    if (atts.some((a) => a.kind === "image") && currentModel && !currentModel.image) {
      setNotice(`"${currentModel.name}" görsel desteklemiyor. Model menüsünden "Görsel destekli" filtresiyle bir model seç.`);
      return false;
    }
    return true;
  }

  async function send() {
    const text = input.trim();
    if ((!text && pending.length === 0) || streaming) return;
    if (!checkImages(pending)) return;

    const userMsg: Msg = {
      id: uid(),
      role: "user",
      content: text,
      attachments: pending.length ? pending : undefined,
    };
    let convId = activeId;
    let history: Msg[];
    if (!active || !convId) {
      convId = uid();
      const conv: Conv = { id: convId, title: makeTitle(text, pending), messages: [], updatedAt: Date.now() };
      setConvs((cs) => [conv, ...cs]);
      setActiveId(convId);
      history = [userMsg];
    } else {
      history = [...active.messages, userMsg];
    }
    setInput("");
    setPending([]);
    setNotice(null);
    await runCompletion(convId, history);
  }

  function stop() {
    abortRef.current?.abort();
  }

  function regenerate(msgId: string) {
    if (!active || streaming) return;
    const idx = active.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const history = active.messages.slice(0, idx);
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (lastUser && !checkImages(lastUser.attachments || [])) return;
    runCompletion(active.id, history);
  }

  function saveEdit(msgId: string) {
    if (!active || streaming) return;
    const idx = active.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const orig = active.messages[idx];
    if (!editText.trim() && !orig.attachments?.length) return;
    const history = [...active.messages.slice(0, idx), { ...orig, content: editText.trim() }];
    setEditingId(null);
    runCompletion(active.id, history);
  }

  function newChat() {
    if (streaming) stop();
    setActiveId(null);
    setInput("");
    setPending([]);
    setEditingId(null);
    setSidebarOpen(false);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  function renameConv(id: string) {
    const c = convs.find((x) => x.id === id);
    const t = prompt("Sohbet adı", c?.title || "");
    if (t && t.trim()) updateConv(id, (x) => ({ ...x, title: t.trim() }));
  }

  function deleteConv(id: string) {
    if (!confirm("Bu sohbet silinsin mi?")) return;
    if (id === activeId) {
      if (streaming) stop();
      setActiveId(null);
    }
    setConvs((cs) => cs.filter((c) => c.id !== id));
  }

  function deleteAll() {
    if (!confirm("TÜM sohbetler bu tarayıcıdan silinsin mi?")) return;
    if (streaming) stop();
    setConvs([]);
    setActiveId(null);
    setSettingsOpen(false);
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" }).catch(() => {});
    location.href = "/login";
  }

  const q = convSearch.toLocaleLowerCase("tr");
  const filteredConvs = convs
    .filter((c) => c.title.toLocaleLowerCase("tr").includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const lastAsstId = active ? [...active.messages].reverse().find((m) => m.role === "assistant")?.id : undefined;

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
            {pending.map((a) => (
              <AttachmentChip key={a.id} a={a} onRemove={() => setPending((p) => p.filter((x) => x.id !== a.id))} />
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          value={input}
          rows={1}
          placeholder={active ? "Yanıtla…" : "Bir mesaj yaz…"}
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
          <ModelPicker models={models} value={model} onChange={setModel} error={modelsError} />
          <div className="spacer" />
          {streaming ? (
            <button className="send-btn" title="Durdur" onClick={stop}><Icon.Stop /></button>
          ) : (
            <button className="send-btn" title="Gönder" disabled={!input.trim() && pending.length === 0} onClick={send}>
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
          {filteredConvs.length === 0 && <div className="muted small pad">Henüz sohbet yok</div>}
          {filteredConvs.map((c) => (
            <div
              key={c.id}
              className={"conv-item" + (c.id === activeId ? " active" : "")}
              onClick={() => {
                setActiveId(c.id);
                setEditingId(null);
                setSidebarOpen(false);
              }}
            >
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
        <button className="sidebar-foot" onClick={() => setSettingsOpen(true)}><Icon.Settings /> Ayarlar</button>
      </aside>
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} title="Menü"><Icon.Menu /></button>
          <div className="topbar-title">{active?.title || ""}</div>
          <button className="icon-btn mobile-only" onClick={newChat} title="Yeni sohbet"><Icon.Plus /></button>
        </header>

        {!active ? (
          <div className="empty">
            <h1 className="greeting"><span className="greet-mark"><Icon.Sparkle /></span> Bugün nasıl yardımcı olabilirim?</h1>
            {composer}
          </div>
        ) : (
          <>
            <div className="messages" ref={scrollRef} onScroll={onScroll}>
              <div className="messages-inner">
                {active.messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="msg user">
                      {m.attachments && (
                        <div className="msg-atts">{m.attachments.map((a) => <AttachmentChip key={a.id} a={a} />)}</div>
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
                          {!streaming && (
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
                            <button className="icon-btn sm" title="Yeniden oluştur (seçili modelle)" onClick={() => regenerate(m.id)}>
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
            <p className="muted small">Sohbetler yalnızca bu tarayıcıda saklanır, sunucuya kaydedilmez.</p>
            <div className="modal-actions">
              <button className="btn danger" onClick={deleteAll}>Tüm sohbetleri sil</button>
              <div className="spacer" />
              <button className="btn ghost" onClick={logout}>Çıkış yap</button>
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
