import type { SavedState } from "./types";

const KEY = "coklu-ai-v1";

export function loadState(): Partial<SavedState> | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

// Sohbetler sadece bu tarayıcıda saklanır. Yer dolarsa eklerin içeriğini atıp tekrar dener.
export function saveState(state: SavedState): "ok" | "slim" | "fail" {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return "ok";
  } catch {
    try {
      const slim: SavedState = {
        ...state,
        convs: state.convs.map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.attachments
              ? {
                  ...m,
                  attachments: m.attachments.map((a) => ({
                    ...a,
                    dataUrl: undefined,
                    text: a.text && a.text.length > 20000 ? undefined : a.text,
                  })),
                }
              : m
          ),
        })),
      };
      localStorage.setItem(KEY, JSON.stringify(slim));
      return "slim";
    } catch {
      return "fail";
    }
  }
}
