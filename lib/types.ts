export type ModelInfo = {
  id: string;
  name: string;
  context: number;
  free: boolean;
  image: boolean;
  promptPrice: number; // $ / token
  completionPrice: number; // $ / token
  // site: sitenin OpenRouter anahtarı · own: kullanıcının OpenRouter anahtarı · gemini: kullanıcının Gemini anahtarı
  source: "site" | "own" | "gemini";
};

export type Recommended = { free: string[]; paid: string[] };

export type Tier = "free" | "pro" | "own";

export type AttachmentMeta = {
  id: string;
  name: string;
  kind: "image" | "pdf" | "text";
  mime: string;
  size: number;
};

// Yazma kutusunda bekleyen (yükleniyor / hazır) ek
export type PendingAttachment = {
  key: string;
  name: string;
  kind: "image" | "pdf" | "text";
  size: number;
  previewUrl?: string;
  progress: number;
  meta?: AttachmentMeta;
  error?: string;
};

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  attachments?: AttachmentMeta[];
  model?: string;
  error?: string;
};

export type ConvSummary = { id: string; title: string; updatedAt: number };

export type Theme = "system" | "light" | "dark";

export type Me = {
  user: {
    id: string;
    username: string;
    settings: { system?: string; theme?: Theme; model?: string };
    isPro: boolean;
    isAdmin: boolean;
  };
  keys: { gemini: string | null; openrouter: string | null }; // maskeli gösterim
  keysEnabled: boolean;
  blob: { enabled: boolean; access: "public" | "private" };
};
