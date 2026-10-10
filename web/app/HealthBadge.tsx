"use client";

import { useEffect, useState } from "react";

/** M1 占位：经同源代理探测后端健康状态（验证 /api/* → BACKEND_ORIGIN 链路）。 */
export default function HealthBadge() {
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body) => setState(body?.status === "ok" ? "ok" : "error"))
      .catch(() => setState("error"));
  }, []);

  const text =
    state === "checking"
      ? "正在检测后端 /api/health …"
      : state === "ok"
        ? "✓ 后端 /api/health 正常（同源代理已打通）"
        : "✗ 后端不可达（api 容器未启动或代理未生效）";
  return <p className="status">{text}</p>;
}
