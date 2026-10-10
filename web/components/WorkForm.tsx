"use client";

/**
 * 作品登记表单（Build-E【2】：原 admin 登记表单，管理融进前台后挂在 /new；
 * Build-E【3】：类型感知重排——视频：模型 → 比例下拉 → 时长 → 提示词 →
 * 首帧/尾帧 URL（reference_images role=first/last）→ 其他参考图（无 role 有序）→
 * 封面/缩略图 → 媒体 URL → 参数 JSON → 专辑标签精选；图片：基本信息含模型 →
 * 媒体与尺寸 → 提示词 → 参考图 → 参数 → 专辑标签精选）：
 * 校验：width/height 必填 >0；prompt 必填；URL 即时校验 https（onBlur+onChange）；
 * video 必带 poster_url + duration_seconds（image 禁带）；parameters 必须为 JSON 对象。
 * 提交 POST /api/admin/works：201 登记成功 / 200 skipped 幂等提示 / 422 校验错误 toast。
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useToast } from "@/components/Toast";
import { ApiClientError, clientSend } from "@/lib/api";
import type { AlbumInfo, TagInfo, WorkDetail, WorkType } from "@/lib/types";

interface Props {
  albums: AlbumInfo[];
  tags: TagInfo[];
  /** 编辑态：传入详情则走 PATCH /api/admin/works/{id}（type/storage 键不可改，不提交） */
  initial?: WorkDetail;
}

interface RefRow {
  url: string;
  thumb_url: string;
}

/** Build-E【3】视频比例下拉（16:9/9:16/1:1/4:3/3:4 等，选后自动换算 width/height） */
const VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5"] as const;
type VideoRatio = (typeof VIDEO_RATIOS)[number];

function parseRatio(v: string): [number, number] | null {
  const m = /^(\d+(?:\.\d+)?)\s*[:/×x]\s*(\d+(?:\.\d+)?)$/.exec(v.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
  return [a, b];
}

interface FormState {
  type: WorkType;
  title: string;
  description: string;
  prompt: string;
  negative_prompt: string;
  model_name: string;
  model_version: string;
  parametersText: string;
  refs: RefRow[];
  /** Build-E【3】视频首/尾帧 URL（提交时写入 reference_images，role=first/last；图片态闲置） */
  first_frame_url: string;
  last_frame_url: string;
  /** Build-E【3】视频比例下拉（切换时按已填宽/高之一换算另一边，默认宽度 1280） */
  video_ratio: string;
  media_url: string;
  thumb_url: string;
  poster_url: string;
  width: string;
  height: string;
  duration_seconds: string;
  album_slug: string;
  tag_slugs: string;
  featured: boolean;
  storage_backend: string;
  external_file_id: string;
  content_hash: string;
}

const INITIAL: FormState = {
  type: "image",
  title: "",
  description: "",
  prompt: "",
  negative_prompt: "",
  model_name: "",
  model_version: "",
  parametersText: "",
  refs: [],
  first_frame_url: "",
  last_frame_url: "",
  video_ratio: "16:9",
  media_url: "",
  thumb_url: "",
  poster_url: "",
  width: "",
  height: "",
  duration_seconds: "",
  album_slug: "",
  tag_slugs: "",
  featured: false,
  storage_backend: "chevereto",
  external_file_id: "",
  content_hash: "",
};

/** URL 即时校验（DESIGN 3.2：仅放行公网 HTTPS）；空值时 required 才报错 */
function urlError(value: string, required: boolean): string | null {
  const v = value.trim();
  if (!v) return required ? "必填" : null;
  if (!/^https:\/\/.+/i.test(v)) return "必须是公网 HTTPS 地址（https://…）";
  return null;
}

function parseTagInput(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** WorkDetail → 表单初始态（编辑态预填；视频按 role 回填首/尾帧输入框） */
function fromDetail(w: WorkDetail): FormState {
  const refs = w.reference_images ?? [];
  const first = refs.find((r) => r.role === "first");
  const last = refs.find((r) => r.role === "last");
  const others = refs.filter((r) => r.role !== "first" && r.role !== "last");
  return {
    type: w.type,
    title: w.title,
    description: w.description,
    prompt: w.prompt,
    negative_prompt: w.negative_prompt ?? "",
    model_name: w.model_name,
    model_version: w.model_version ?? "",
    parametersText: Object.keys(w.parameters ?? {}).length
      ? JSON.stringify(w.parameters, null, 2)
      : "",
    refs: others.map((r) => ({
      url: r.url,
      thumb_url: r.thumb_url ?? "",
    })),
    first_frame_url: first?.url ?? "",
    last_frame_url: last?.url ?? "",
    video_ratio: "",
    media_url: w.media_url,
    thumb_url: w.thumb_url === w.media_url ? "" : w.thumb_url,
    poster_url: w.poster_url ?? "",
    width: String(w.width),
    height: String(w.height),
    duration_seconds: w.duration_seconds != null ? String(w.duration_seconds) : "",
    album_slug: w.album?.slug ?? "",
    tag_slugs: w.tags.map((t) => t.slug).join(", "),
    featured: w.featured,
    storage_backend: w.storage_backend,
    external_file_id: "",
    content_hash: "",
  };
}

export default function WorkForm({ albums, tags, initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const editing = initial != null;
  const [f, setF] = useState<FormState>(() => (initial ? fromDetail(initial) : INITIAL));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false); // 提交后才显示必填错误

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const isVideo = f.type === "video";

  // ---- 即时 URL 校验状态（红框 + 提示文字）
  const urlErrors = {
    media_url: urlError(f.media_url, true),
    thumb_url: urlError(f.thumb_url, false),
    poster_url: urlError(f.poster_url, isVideo),
    first_frame_url: urlError(f.first_frame_url, false),
    last_frame_url: urlError(f.last_frame_url, false),
    refs: f.refs.map((r) => urlError(r.url, true)),
  };

  /** 视频参考图组装：首帧（role=first）→ 尾帧（role=last）→ 其他（无 role 有序） */
  const buildVideoRefs = () => {
    const out: { order: number; url: string; thumb_url: string | null; role?: string }[] = [];
    let order = 1;
    if (f.first_frame_url.trim())
      out.push({ order: order++, url: f.first_frame_url.trim(), thumb_url: null, role: "first" });
    if (f.last_frame_url.trim())
      out.push({ order: order++, url: f.last_frame_url.trim(), thumb_url: null, role: "last" });
    for (const r of f.refs) {
      if (!r.url.trim()) continue;
      out.push({ order: order++, url: r.url.trim(), thumb_url: r.thumb_url.trim() || null });
    }
    return out;
  };

  /** 图片参考图组装：有序列表，无 role */
  const buildImageRefs = () =>
    f.refs
      .filter((r) => r.url.trim())
      .map((r, i) => ({
        order: i + 1,
        url: r.url.trim(),
        thumb_url: r.thumb_url.trim() || null,
      }));

  // ---- 提交校验（返回错误摘要；空 = 通过）
  const validate = (): string[] => {
    const errs: string[] = [];
    if (!f.prompt.trim()) errs.push("提示词必填");
    if (urlError(f.media_url, true)) errs.push("media_url 必须是公网 HTTPS 地址");
    if (urlError(f.thumb_url, false)) errs.push("thumb_url 必须是 HTTPS 地址");
    const w = Number(f.width);
    const h = Number(f.height);
    if (!f.width.trim() || !Number.isInteger(w) || w <= 0) errs.push("宽度必填且为大于 0 的整数");
    if (!f.height.trim() || !Number.isInteger(h) || h <= 0) errs.push("高度必填且为大于 0 的整数");
    if (isVideo) {
      if (urlError(f.poster_url, true)) errs.push("视频必须提供 HTTPS 封面帧 poster_url");
      const d = Number(f.duration_seconds);
      if (!f.duration_seconds.trim() || !isFinite(d) || d <= 0)
        errs.push("视频必须填写时长（秒，>0）");
    }
    if (f.parametersText.trim()) {
      try {
        const parsed = JSON.parse(f.parametersText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
          errs.push("parameters 必须是 JSON 对象");
      } catch {
        errs.push("parameters 不是合法 JSON");
      }
    }
    f.refs.forEach((r, i) => {
      const label = isVideo ? `其他参考图 #${i + 1}` : `参考图 #${i + 1}`;
      if (urlError(r.url, true)) errs.push(`${label} 的 url 必须是 HTTPS 地址`);
      if (r.thumb_url && urlError(r.thumb_url, false))
        errs.push(`${label} 的 thumb_url 必须是 HTTPS 地址`);
    });
    if (isVideo) {
      if (urlError(f.first_frame_url, false)) errs.push("首帧参考图 URL 必须是 HTTPS 地址");
      if (urlError(f.last_frame_url, false)) errs.push("尾帧参考图 URL 必须是 HTTPS 地址");
    }
    return errs;
  };

  // ---- 参考图有序列表操作（顺序即 reference image N，DESIGN 2.2）
  const setRef = (i: number, patch: Partial<RefRow>) =>
    setF((prev) => ({
      ...prev,
      refs: prev.refs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  const moveRef = (i: number, dir: -1 | 1) =>
    setF((prev) => {
      const next = [...prev.refs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...prev, refs: next };
    });
  const removeRef = (i: number) =>
    setF((prev) => ({ ...prev, refs: prev.refs.filter((_, idx) => idx !== i) }));

  /** Build-E【3】视频比例切换：按已填宽/高之一换算另一边（都没填则默认宽 1280） */
  const onRatioChange = (v: string) => {
    setF((prev) => {
      const next = { ...prev, video_ratio: v };
      const parsed = parseRatio(v);
      if (!parsed) return next;
      const [a, b] = parsed;
      const w = Number(prev.width);
      const h = Number(prev.height);
      if (prev.width.trim() && Number.isFinite(w) && w > 0) {
        next.height = String(Math.max(1, Math.round((w * b) / a)));
      } else if (prev.height.trim() && Number.isFinite(h) && h > 0) {
        next.width = String(Math.max(1, Math.round((h * a) / b)));
      } else {
        next.width = "1280";
        next.height = String(Math.max(1, Math.round((1280 * b) / a)));
      }
      return next;
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validate();
    if (errs.length > 0) {
      toast.push(errs[0] + (errs.length > 1 ? `（等 ${errs.length} 项）` : ""), "error");
      return;
    }
    if (submitting) return;
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      type: f.type,
      title: f.title.trim(),
      description: f.description.trim(),
      prompt: f.prompt.trim(),
      negative_prompt: f.negative_prompt.trim() || null,
      model_name: f.model_name.trim(),
      model_version: f.model_version.trim() || null,
      parameters: f.parametersText.trim() ? JSON.parse(f.parametersText) : {},
      reference_images: isVideo ? buildVideoRefs() : buildImageRefs(),
      media_url: f.media_url.trim(),
      thumb_url: f.thumb_url.trim() || null, // 缺省 = media_url（API 兜底，DESIGN 2.2）
      poster_url: isVideo ? f.poster_url.trim() : null,
      width: Number(f.width),
      height: Number(f.height),
      duration_seconds: isVideo ? Number(f.duration_seconds) : null,
      storage_backend: f.storage_backend.trim() || "chevereto",
      external_file_id: f.external_file_id.trim() || null,
      content_hash: f.content_hash.trim() || null,
      album_slug: f.album_slug || null,
      tag_slugs: parseTagInput(f.tag_slugs),
      featured: f.featured,
    };

    try {
      if (editing && initial) {
        // 编辑态：PATCH 可变字段（type/storage 键不可改，后端 WorkUpdate 无这些字段）
        const patch: Record<string, unknown> = {
          title: f.title.trim(),
          description: f.description.trim(),
          prompt: f.prompt.trim(),
          negative_prompt: f.negative_prompt.trim() || null,
          model_name: f.model_name.trim(),
          model_version: f.model_version.trim() || null,
          parameters: f.parametersText.trim() ? JSON.parse(f.parametersText) : {},
          reference_images: isVideo ? buildVideoRefs() : buildImageRefs(),
          media_url: f.media_url.trim(),
          thumb_url: f.thumb_url.trim() || f.media_url.trim(),
          poster_url: isVideo ? f.poster_url.trim() : null,
          width: Number(f.width),
          height: Number(f.height),
          duration_seconds: isVideo ? Number(f.duration_seconds) : null,
          album_slug: f.album_slug || null,
          tag_slugs: parseTagInput(f.tag_slugs),
          featured: f.featured,
        };
        await clientSend("PATCH", `/api/admin/works/${initial.id}`, patch);
        toast.push(`已保存「${f.title.trim() || initial.id}」`, "success");
        router.push(`/works/${initial.id}`);
        router.refresh();
        return;
      }
      const res = await clientSend<{ work?: { id: string }; skipped?: boolean }>(
        "POST",
        "/api/admin/works",
        payload,
      );
      if (res?.skipped) {
        toast.push(
          `幂等跳过：external_file_id 已登记（现有作品 ${res.work?.id ?? "?"}），未重复创建`,
          "info",
        );
      } else {
        toast.push(`登记成功：${f.title.trim() || res?.work?.id || "新作品"}`, "success");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      toast.push(err instanceof Error ? err.message : "登记失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const showReq = (missing: boolean) => submitted && missing;

  return (
    <form className="admin-page work-form" onSubmit={onSubmit} noValidate>
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">{editing ? "Edit Work" : "New Work"}</p>
          <h1 className="admin-title">{editing ? "编辑作品" : "登记作品"}</h1>
        </div>
        <Link href={editing && initial ? `/works/${initial.id}` : "/"} className="btn btn-secondary">
          {editing ? "← 返回详情" : "← 返回首页"}
        </Link>
      </div>

      {/* ---------- 基本信息 ---------- */}
      <section className="form-section" aria-label="基本信息">
        <h2 className="form-section-title">基本信息</h2>
        <div className="form-grid">
          <div className="form-field">
            <span className="form-label">类型{editing && "（创建后不可更改）"}</span>
            <div className="radio-row" role="radiogroup" aria-label="作品类型">
              <label className="radio-item">
                <input
                  type="radio"
                  name="type"
                  value="image"
                  checked={f.type === "image"}
                  onChange={() => set("type", "image")}
                  disabled={editing}
                />
                图片
              </label>
              <label className="radio-item">
                <input
                  type="radio"
                  name="type"
                  value="video"
                  checked={f.type === "video"}
                  onChange={() => set("type", "video")}
                  disabled={editing}
                />
                视频
              </label>
            </div>
          </div>
          <label className="form-field">
            <span className="form-label">标题</span>
            <input
              className="form-input"
              value={f.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="（可空，展示层降级为提示词摘要）"
            />
          </label>
          <label className="form-field">
            <span className="form-label">模型名 model_name{isVideo && <i aria-hidden="true">（视频首项）</i>}</span>
            <input
              className="form-input"
              value={f.model_name}
              onChange={(e) => set("model_name", e.target.value)}
              placeholder={isVideo ? "Sora / Runway Gen-4 / 可灵…" : "Hy Image 3.5 Preview"}
            />
          </label>
          <label className="form-field">
            <span className="form-label">模型版本 model_version（可空）</span>
            <input
              className="form-input mono"
              value={f.model_version}
              onChange={(e) => set("model_version", e.target.value)}
              placeholder="3.5-preview-0928"
            />
          </label>
          <label className="form-field form-field-wide">
            <span className="form-label">描述 / 策展文案</span>
            <textarea
              className="form-textarea"
              rows={2}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* ---------- 视频规格：比例下拉（切换自动换算宽高）+ 时长（视频态紧跟基本信息，图片态不渲染） ---------- */}
      {isVideo && (
        <section className="form-section" aria-label="视频规格">
          <h2 className="form-section-title">视频规格（比例 → 宽高自动换算，可再微调）</h2>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">比例</span>
              <select
                className="form-select"
                value={f.video_ratio}
                onChange={(e) => onRatioChange(e.target.value)}
              >
                {VIDEO_RATIOS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="field-hint">切换后按当前宽/高之一换算另一边；都空则默认宽 1280。</span>
            </label>
            <label className="form-field">
              <span className="form-label">
                时长（秒）<i aria-hidden="true"> *</i>
              </span>
              <input
                className={`form-input mono${showReq(!f.duration_seconds.trim()) ? " input-invalid" : ""}`}
                type="number"
                min={0.1}
                step={0.1}
                value={f.duration_seconds}
                onChange={(e) => set("duration_seconds", e.target.value)}
                placeholder="6.2"
                required
              />
              {showReq(!f.duration_seconds.trim()) && <span className="field-hint error">必填</span>}
            </label>
          </div>
        </section>
      )}

      {/* ---------- 媒体 URL 与尺寸：视频只保留封面/宽高（比例时长见上方「视频规格」），图片保留原结构 ---------- */}
      <section className="form-section" aria-label="媒体 URL 与尺寸">
        <h2 className="form-section-title">媒体 URL 与尺寸（只存外部直链，不落盘二进制）</h2>
        <div className="form-grid">
          {!isVideo && (
            <label className={`form-field form-field-wide${urlErrors.media_url && (f.media_url || submitted) ? " field-error" : ""}`}>
              <span className="form-label">
                media_url 原图直链 <i aria-hidden="true">*</i>
              </span>
              <input
                className="form-input mono"
                value={f.media_url}
                onChange={(e) => set("media_url", e.target.value)}
                placeholder="https://cdn.example.com/i/xxx.png"
                required
              />
              {urlErrors.media_url && (f.media_url || submitted) && (
                <span className="field-hint error">{urlErrors.media_url}</span>
              )}
            </label>
          )}
          {!isVideo && (
            <label className={`form-field${urlErrors.thumb_url && f.thumb_url ? " field-error" : ""}`}>
              <span className="form-label">thumb_url 缩略图直链（缺省 = media_url）</span>
              <input
                className="form-input mono"
                value={f.thumb_url}
                onChange={(e) => set("thumb_url", e.target.value)}
                placeholder="https://cdn.example.com/i/xxx.th.png"
              />
              {urlErrors.thumb_url && f.thumb_url && (
                <span className="field-hint error">{urlErrors.thumb_url}</span>
              )}
            </label>
          )}
          <label className={`form-field${urlErrors.poster_url && (f.poster_url || submitted) ? " field-error" : ""}`}>
            <span className="form-label">
              poster_url 视频封面帧{isVideo && <i aria-hidden="true"> *</i>}
            </span>
            <input
              className="form-input mono"
              value={f.poster_url}
              onChange={(e) => set("poster_url", e.target.value)}
              placeholder={isVideo ? "https://cdn.example.com/v/xxx.frame.jpg *" : "（图片作品无需填写）"}
              disabled={!isVideo}
              required={isVideo}
            />
            {urlErrors.poster_url && (f.poster_url || (submitted && isVideo)) && (
              <span className="field-hint error">{urlErrors.poster_url}</span>
            )}
          </label>
          <label className="form-field">
            <span className="form-label">
              宽度 px <i aria-hidden="true">*</i>
            </span>
            <input
              className={`form-input mono${showReq(!f.width.trim()) ? " input-invalid" : ""}`}
              type="number"
              min={1}
              step={1}
              value={f.width}
              onChange={(e) => set("width", e.target.value)}
              placeholder="1024"
              required
            />
            {showReq(!f.width.trim()) && <span className="field-hint error">必填</span>}
          </label>
          <label className="form-field">
            <span className="form-label">
              高度 px <i aria-hidden="true">*</i>
            </span>
            <input
              className={`form-input mono${showReq(!f.height.trim()) ? " input-invalid" : ""}`}
              type="number"
              min={1}
              step={1}
              value={f.height}
              onChange={(e) => set("height", e.target.value)}
              placeholder="1536"
              required
            />
            {showReq(!f.height.trim()) && <span className="field-hint error">必填</span>}
          </label>
        </div>
      </section>

      {/* ---------- 提示词 ---------- */}
      <section className="form-section" aria-label="提示词">
        <h2 className="form-section-title">提示词</h2>
        <div className="form-grid">
          <label className="form-field form-field-wide">
            <span className="form-label">
              正向提示词 prompt <i aria-hidden="true">*</i>
            </span>
            <textarea
              className={`form-textarea mono${showReq(!f.prompt.trim()) ? " input-invalid" : ""}`}
              rows={4}
              value={f.prompt}
              onChange={(e) => set("prompt", e.target.value)}
              placeholder="cyberpunk alley in heavy rain, neon reflections…"
              required
            />
            {showReq(!f.prompt.trim()) && <span className="field-hint error">提示词必填</span>}
          </label>
          <label className="form-field form-field-wide">
            <span className="form-label">负向提示词 negative_prompt（可空）</span>
            <textarea
              className="form-textarea mono"
              rows={2}
              value={f.negative_prompt}
              onChange={(e) => set("negative_prompt", e.target.value)}
              placeholder="blurry, lowres, watermark"
            />
          </label>
        </div>
      </section>

      {/* ---------- 视频：首帧/尾帧/其他参考图/封面/媒体 URL ----------
          顺序：首帧（role=first）→ 尾帧（role=last）→ 其他参考图（无 role）→
          缩略图/封面 → 媒体文件 URL → 参数 JSON → 专辑标签精选 */}
      {isVideo && (
        <section className="form-section" aria-label="视频参考帧">
          <h2 className="form-section-title">首帧 / 尾帧参考图（写入 reference_images role=first/last）</h2>
          <div className="form-grid">
            <label className={`form-field${urlErrors.first_frame_url && f.first_frame_url ? " field-error" : ""}`}>
              <span className="form-label">首帧参考图 URL（可空）</span>
              <input
                className="form-input mono"
                value={f.first_frame_url}
                onChange={(e) => set("first_frame_url", e.target.value)}
                placeholder="https://cdn.example.com/r/first.png"
              />
              {urlErrors.first_frame_url && f.first_frame_url && (
                <span className="field-hint error">{urlErrors.first_frame_url}</span>
              )}
            </label>
            <label className={`form-field${urlErrors.last_frame_url && f.last_frame_url ? " field-error" : ""}`}>
              <span className="form-label">尾帧参考图 URL（可空）</span>
              <input
                className="form-input mono"
                value={f.last_frame_url}
                onChange={(e) => set("last_frame_url", e.target.value)}
                placeholder="https://cdn.example.com/r/last.png"
              />
              {urlErrors.last_frame_url && f.last_frame_url && (
                <span className="field-hint error">{urlErrors.last_frame_url}</span>
              )}
            </label>
          </div>
        </section>
      )}

      {/* ---------- 参数 JSON（图片态；视频用上方专属段） ---------- */}
      {!isVideo && (
        <section className="form-section" aria-label="生成参数">
        <h2 className="form-section-title">生成参数 parameters（JSON 对象，可空）</h2>
        <label className="form-field">
          <textarea
            className={`form-textarea mono${f.parametersText.trim() && (() => { try { const p = JSON.parse(f.parametersText); return typeof p !== "object" || p === null || Array.isArray(p); } catch { return true; } })() ? " input-invalid" : ""}`}
            rows={4}
            value={f.parametersText}
            onChange={(e) => set("parametersText", e.target.value)}
            placeholder={'{ "size": "1024x1536", "seed": 421087, "steps": 30, "cfg_scale": 7.5 }'}
            aria-label="parameters JSON"
          />
          <span className="field-hint">
            异构参数一个 JSON 收纳：size / seed / steps / cfg / fps / aspect_ratio…
          </span>
        </label>
        </section>
      )}

      {/* ---------- 参考图有序列表（图片：参考图；视频：其他参考图，无 role） ---------- */}
      <section className="form-section" aria-label="参考图">
        <h2 className="form-section-title">
          {isVideo ? "其他参考图（无 role，按序追加在首/尾帧之后）" : "参考图 reference_images（顺序即 reference image N）"}
        </h2>
        {f.refs.length === 0 && <p className="field-hint">文生图为空；图生图按生成顺序添加。</p>}
        <ol className="ref-editor-list">
          {f.refs.map((ref, i) => (
            <li className="ref-editor-row" key={i}>
              <span className="ref-editor-order mono" aria-hidden="true">
                #{i + 1}
              </span>
              <div className="ref-editor-fields">
                <input
                  className={`form-input mono${urlErrors.refs[i] && (ref.url || submitted) ? " input-invalid" : ""}`}
                  value={ref.url}
                  onChange={(e) => setRef(i, { url: e.target.value })}
                  placeholder="url：https://cdn.example.com/r/ref-01.png *"
                  aria-label={`参考图 #${i + 1} url`}
                />
                <input
                  className="form-input mono"
                  value={ref.thumb_url}
                  onChange={(e) => setRef(i, { thumb_url: e.target.value })}
                  placeholder="thumb_url（可空）：https://…"
                  aria-label={`参考图 #${i + 1} thumb_url`}
                />
                {urlErrors.refs[i] && (ref.url || submitted) && (
                  <span className="field-hint error">{urlErrors.refs[i]}</span>
                )}
              </div>
              <div className="ref-editor-actions">
                <button type="button" className="icon-btn" aria-label={`上移 #${i + 1}`} disabled={i === 0} onClick={() => moveRef(i, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label={`下移 #${i + 1}`} disabled={i === f.refs.length - 1} onClick={() => moveRef(i, 1)}>
                  ↓
                </button>
                <button type="button" className="icon-btn danger" aria-label={`移除 #${i + 1}`} onClick={() => removeRef(i)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setF((prev) => ({ ...prev, refs: [...prev.refs, { url: "", thumb_url: "" }] }))}
        >
          {isVideo ? "＋ 添加其他参考图" : "＋ 添加参考图"}
        </button>
      </section>

      {/* ---------- 视频：缩略图/封面 → 媒体文件 URL → 其他参数 JSON
         （与基本信息区 poster 呼应，此处收拢视频全部媒体入口） ---------- */}
      {isVideo && (
        <section className="form-section" aria-label="视频媒体与参数">
          <h2 className="form-section-title">缩略图 / 封面 / 媒体文件 / 其他参数</h2>
          <div className="form-grid">
            <label className={`form-field${urlErrors.thumb_url && f.thumb_url ? " field-error" : ""}`}>
              <span className="form-label">缩略图 thumb_url（缺省 = media_url）</span>
              <input
                className="form-input mono"
                value={f.thumb_url}
                onChange={(e) => set("thumb_url", e.target.value)}
                placeholder="https://cdn.example.com/v/xxx.th.jpg"
              />
              {urlErrors.thumb_url && f.thumb_url && (
                <span className="field-hint error">{urlErrors.thumb_url}</span>
              )}
            </label>
            <label className={`form-field form-field-wide${urlErrors.media_url && (f.media_url || submitted) ? " field-error" : ""}`}>
              <span className="form-label">
                媒体文件 URL media_url 原片直链 <i aria-hidden="true">*</i>
              </span>
              <input
                className="form-input mono"
                value={f.media_url}
                onChange={(e) => set("media_url", e.target.value)}
                placeholder="https://cdn.example.com/v/xxx.mp4"
                required
              />
              {urlErrors.media_url && (f.media_url || submitted) && (
                <span className="field-hint error">{urlErrors.media_url}</span>
              )}
            </label>
            <label className="form-field form-field-wide">
              <span className="form-label">其他参数 JSON（可空）</span>
              <textarea
                className={`form-textarea mono${f.parametersText.trim() && (() => { try { const p = JSON.parse(f.parametersText); return typeof p !== "object" || p === null || Array.isArray(p); } catch { return true; } })() ? " input-invalid" : ""}`}
                rows={4}
                value={f.parametersText}
                onChange={(e) => set("parametersText", e.target.value)}
                placeholder={'{ "fps": 24, "codec": "h264", "seed": 421087 }'}
                aria-label="parameters JSON（视频）"
              />
            </label>
          </div>
          <p className="field-hint">封面帧 poster_url 见上方「媒体 URL 与尺寸」区（视频必填）。</p>
        </section>
      )}

      {/* ---------- 专辑 / 标签 / 精选 ---------- */}
      <section className="form-section" aria-label="策展与精选">
        <h2 className="form-section-title">专辑 / 标签 / 精选</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="form-label">所属专辑</span>
            <select
              className="form-select"
              value={f.album_slug}
              onChange={(e) => set("album_slug", e.target.value)}
            >
              <option value="">（无专辑）</option>
              {albums.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">标签（逗号分隔，缺失自动创建）</span>
            <input
              className="form-input"
              value={f.tag_slugs}
              onChange={(e) => set("tag_slugs", e.target.value)}
              list="workform-tag-options"
              placeholder="如：城市, 夜景, 慢门"
            />
            <datalist id="workform-tag-options">
              {tags.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="form-field checkbox-field">
            <input
              type="checkbox"
              checked={f.featured}
              onChange={(e) => set("featured", e.target.checked)}
            />
            <span>
              精选 <span className="featured-star" aria-hidden="true">★</span>（首页精选 rail）
            </span>
          </label>
        </div>
      </section>

      {/* ---------- 溯源（可选；编辑态隐藏：PATCH 不支持 storage 键） ---------- */}
      {!editing && (
      <section className="form-section" aria-label="存储溯源">
        <h2 className="form-section-title">存储溯源（可选）</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="form-label">storage_backend</span>
            <input
              className="form-input mono"
              value={f.storage_backend}
              onChange={(e) => set("storage_backend", e.target.value)}
              placeholder="chevereto / webdav / s3 / url…"
            />
          </label>
          <label className="form-field">
            <span className="form-label">external_file_id（幂等导入唯一键）</span>
            <input
              className="form-input mono"
              value={f.external_file_id}
              onChange={(e) => set("external_file_id", e.target.value)}
            />
          </label>
          <label className="form-field">
            <span className="form-label">content_hash（sha256，可空）</span>
            <input
              className="form-input mono"
              value={f.content_hash}
              onChange={(e) => set("content_hash", e.target.value)}
              placeholder="sha256:3f7a…"
            />
          </label>
        </div>
      </section>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
          {submitting ? (editing ? "保存中…" : "登记中…") : editing ? "保存修改" : "登记作品"}
        </button>
        <Link
          href={editing && initial ? `/works/${initial.id}` : "/"}
          className="btn btn-ghost btn-lg"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
