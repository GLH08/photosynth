/**
 * 提示词复制三级降级（DESIGN 5.6 / B 模式）：
 * navigator.clipboard.writeText → document.execCommand('copy') → 返回 null（调用方弹手动全选 textarea）。
 */
export type CopyLevel = "clipboard" | "exec";

export async function copyText(text: string): Promise<CopyLevel | null> {
  // 第一级：异步 Clipboard API（需安全上下文）
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    }
  } catch {
    /* 降级到第二级 */
  }
  // 第二级：隐藏 textarea + execCommand（老浏览器 / 非安全上下文）
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return "exec";
  } catch {
    /* 降级到第三级 */
  }
  return null;
}
