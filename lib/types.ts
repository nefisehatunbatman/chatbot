export type ModelInfo = {
  id: string;
  name: string;
  context: number;
  free: boolean;
  image: boolean;
  promptPrice: number; // $ / token
  completionPrice: number; // $ / token
};

export type Attachment = {
  id: string;
  name: string;
  kind: "image" | "pdf" | "text";
  size: number;
  dataUrl?: string; // görsel ve PDF için
  text?: string; // metin/kod dosyası için
};

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  attachments?: Attachment[];
  model?: string;
  error?: string;
};

export type Conv = {
  id: string;
  title: string;
  messages: Msg[];
  updatedAt: number;
};

export type Theme = "system" | "light" | "dark";

export type SavedState = {
  convs: Conv[];
  activeId: string | null;
  model: string | null;
  system: string;
  theme: Theme;
};
