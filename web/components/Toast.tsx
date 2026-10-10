"use client";

/**
 * Toast（DESIGN 5.9）：右上角（Header 下 16px）纵向堆叠，最多 3 条；
 * 白底 r-lg sh-2 + 左侧 4px 语义色条 + 图标；进入右侧滑入 200ms；
 * 自动消失 3s（错误 5s），hover 暂停计时；role="status" / aria-live="polite"。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "info" | "warning" | "error";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving?: boolean;
}

interface ToastApi {
  push: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 兜底：Provider 外使用时退化为 console（不崩溃）
    return useMemo(
      () => ({ push: (m: string) => console.warn("[toast]", m) }),
      [],
    );
  }
  return ctx;
}

const MAX_TOASTS = 3;
const DURATION_MS: Record<ToastVariant, number> = {
  success: 3000,
  info: 3000,
  warning: 3000,
  error: 5000,
};

const ICONS: Record<ToastVariant, string> = {
  success: "✓",
  info: "i",
  warning: "!",
  error: "✕",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, { timeout: ReturnType<typeof setTimeout>; deadline: number; remain: number }>());

  const dismiss = useCallback((id: number) => {
    const entry = timers.current.get(id);
    if (entry) {
      clearTimeout(entry.timeout);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = nextId.current++;
      setToasts((prev) => {
        const next = [...prev, { id, message, variant }];
        // 最多 3 条：超出时移除最早的
        while (next.length > MAX_TOASTS) {
          const dropped = next.shift();
          if (dropped) dismiss(dropped.id);
        }
        return next;
      });
      const remain = DURATION_MS[variant];
      const timeout = setTimeout(() => dismiss(id), remain);
      timers.current.set(id, { timeout, deadline: Date.now() + remain, remain });
    },
    [dismiss],
  );

  // hover 暂停计时：清除 timeout，离开后按剩余时间续跑
  const pause = useCallback((id: number) => {
    const entry = timers.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    entry.remain = Math.max(400, entry.deadline - Date.now());
  }, []);

  const resume = useCallback(
    (id: number) => {
      const entry = timers.current.get(id);
      if (!entry) return;
      entry.deadline = Date.now() + entry.remain;
      entry.timeout = setTimeout(() => dismiss(id), entry.remain);
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((e) => clearTimeout(e.timeout));
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.variant}`}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
          >
            <span className="toast-icon" aria-hidden="true">
              {ICONS[t.variant]}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
