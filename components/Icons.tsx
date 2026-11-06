import type { ReactNode } from "react";

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icon = {
  Plus: () => <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  Paperclip: () => <Svg><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></Svg>,
  ArrowUp: () => <Svg><path d="M12 19V5M5 12l7-7 7 7" /></Svg>,
  Stop: () => <Svg><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></Svg>,
  Copy: () => <Svg size={16}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Svg>,
  Check: () => <Svg size={16}><path d="M20 6 9 17l-5-5" /></Svg>,
  Pencil: () => <Svg size={16}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>,
  Refresh: () => <Svg size={16}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></Svg>,
  Trash: () => <Svg size={16}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Svg>,
  Menu: () => <Svg><path d="M4 6h16M4 12h16M4 18h16" /></Svg>,
  Settings: () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Svg>,
  X: () => <Svg><path d="M18 6 6 18M6 6l12 12" /></Svg>,
  File: () => <Svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></Svg>,
  ChevronDown: () => <Svg size={14}><path d="m6 9 6 6 6-6" /></Svg>,
  Search: () => <Svg size={16}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>,
  Download: () => <Svg size={16}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>,
  Logout: () => <Svg size={16}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>,
  Sparkle: () => <Svg size={22}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Svg>,
};
