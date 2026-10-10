"use client";

/**
 * 前台集合管理（Build-E【2】：管理融进前台）：
 * - 专辑：新建 / 编辑（名称/slug/简介/kind/封面/排序）/ 删除二次确认
 *   （删除后作品自动解除关联 SET NULL，后端保证）；
 * - 标签：新建 / 重命名（改名改 slug）/ 删除二次确认（关联自动解除）。
 * 操作后内部 router.refresh() 刷新 SSR 数据；onChanged 可选（有页面级联动时再传）。
 * 公开字典无 id，AlbumManageSlot / TagManageSlot 按 slug 查 admin 列表补 id，
 * 未登录 / 无匹配时不渲染（管理按钮仅登录可见）。
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useToast } from "@/components/Toast";
import { ApiClientError, clientGet, clientSend } from "@/lib/api";
import type { AdminAlbum, AdminTag, AlbumInfo, AlbumKind, TagInfo } from "@/lib/types";

/** slug 自动生成：小写、非 ASCII 折叠为 -；全空退化随机短串（可手改） */
export function slugify(input: string): string {
  const ascii = input
    .trim()
    .toLowerCase()
    .replace(/['"()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `id-${Date.now().toString(36)}`;
}

function useGuard() {
  const router = useRouter();
  const pathname = usePathname();
  return (err: unknown): boolean => {
    if (err instanceof ApiClientError && err.status === 401) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      return true;
    }
    return false;
  };
}

function useConfirmTimeout(active: boolean, reset: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (active) timer.current = setTimeout(reset, 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, reset]);
}

// ---------------------------------------------------------------- 专辑

interface AlbumFormState {
  id?: string;
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  kind: AlbumKind;
  cover_url: string;
  sort_weight: string;
}

const KIND_OPTIONS: { value: AlbumKind; label: string }[] = [
  { value: "mixed", label: "mixed · 图文混合" },
  { value: "image", label: "image · 图片专辑" },
  { value: "video", label: "video · 视频专辑" },
];

export function AlbumManage({
  album,
  onChanged,
}: {
  album: AlbumInfo & { id: string };
  onChanged?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const guard = useGuard();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<AlbumFormState | null>(null);
  useConfirmTimeout(confirming, () => setConfirming(false));

  const startEdit = () =>
    setF({
      id: album.id,
      name: album.name,
      slug: album.slug,
      slugTouched: true,
      description: album.description,
      kind: album.kind,
      cover_url: album.cover_url ?? "",
      sort_weight: String(album.sort_weight ?? 0),
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f || busy) return;
    if (!f.name.trim()) {
      toast.push("专辑名称必填", "warning");
      return;
    }
    const slug = f.slug.trim() || slugify(f.name);
    if (f.cover_url.trim() && !/^https:\/\/.+/i.test(f.cover_url.trim())) {
      toast.push("cover_url 必须是公网 HTTPS 地址", "error");
      return;
    }
    const body = {
      slug,
      name: f.name.trim(),
      description: f.description.trim(),
      kind: f.kind,
      cover_url: f.cover_url.trim() || null,
      sort_weight: Number(f.sort_weight) || 0,
    };
    setBusy(true);
    clientSend("PATCH", `/api/admin/albums/${album.id}`, body)
      .then(() => {
        toast.push(`专辑「${body.name}」已更新`, "success");
        setEditing(false);
        setF(null);
        onChanged?.();
        router.refresh();
      })
      .catch((err) => {
        if (!guard(err)) toast.push(err instanceof Error ? err.message : "操作失败", "error");
      })
      .finally(() => setBusy(false));
  };

  const onDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    clientSend("DELETE", `/api/admin/albums/${album.id}`)
      .then(() => {
        toast.push(`专辑「${album.name}」已删除（作品保留并解除关联）`, "success");
        onChanged?.();
        router.refresh();
      })
      .catch((err) => {
        if (!guard(err)) toast.push(err instanceof Error ? err.message : "删除失败", "error");
      })
      .finally(() => setBusy(false));
  };

  return (
    <span className="manage-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={(e) => {
          e.stopPropagation();
          if (editing) {
            setEditing(false);
            setF(null);
          } else {
            startEdit();
            setEditing(true);
          }
        }}
      >
        {editing ? "收起" : "编辑"}
      </button>
      <button
        type="button"
        className={`btn btn-sm${confirming ? " btn-danger" : " btn-secondary"}`}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        {confirming ? "确认删除?" : "删除"}
      </button>
      {editing && f && (
        <form
          className="inline-edit collections-form"
          style={{ marginTop: 8 }}
          onSubmit={submit}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="inline-edit-row">
            <label className="form-field">
              <span className="form-label">名称 *</span>
              <input
                className="form-input"
                value={f.name}
                onChange={(e) =>
                  setF({ ...f, name: e.target.value, slug: f.slugTouched ? f.slug : slugify(e.target.value) })
                }
              />
            </label>
            <label className="form-field">
              <span className="form-label">slug</span>
              <input
                className="form-input mono"
                value={f.slug}
                onChange={(e) => setF({ ...f, slug: e.target.value, slugTouched: true })}
              />
            </label>
          </div>
          <div className="inline-edit-row">
            <label className="form-field">
              <span className="form-label">kind</span>
              <select
                className="form-select"
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value as AlbumKind })}
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">排序权重</span>
              <input
                className="form-input mono"
                type="number"
                value={f.sort_weight}
                onChange={(e) => setF({ ...f, sort_weight: e.target.value })}
              />
            </label>
          </div>
          <label className="form-field">
            <span className="form-label">封面（HTTPS，可空）</span>
            <input
              className="form-input mono"
              value={f.cover_url}
              onChange={(e) => setF({ ...f, cover_url: e.target.value })}
            />
          </label>
          <label className="form-field">
            <span className="form-label">简介</span>
            <textarea
              className="form-textarea"
              rows={2}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </label>
          <div className="inline-edit-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              保存修改
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setEditing(false);
                setF(null);
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </span>
  );
}

export function AlbumCreateButton({ onChanged }: { onChanged?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useGuard();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    const body = { slug: slug.trim() || slugify(name), name: name.trim() };
    setBusy(true);
    clientSend("POST", "/api/admin/albums", body)
      .then(() => {
        toast.push(`专辑「${body.name}」已创建`, "success");
        setOpen(false);
        setName("");
        setSlug("");
        setSlugTouched(false);
        onChanged?.();
        router.refresh();
      })
      .catch((err) => {
        if (!guard(err)) toast.push(err instanceof Error ? err.message : "创建失败", "error");
      })
      .finally(() => setBusy(false));
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        ＋ 新建专辑
      </button>
    );
  }
  return (
    <form className="inline-edit collections-form" onSubmit={submit}>
      <div className="inline-edit-row">
        <label className="form-field">
          <span className="form-label">名称 *</span>
          <input
            className="form-input"
            value={name}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </label>
        <label className="form-field">
          <span className="form-label">slug（自动生成，可改）</span>
          <input
            className="form-input mono"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
          />
        </label>
      </div>
      <div className="inline-edit-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          创建专辑
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          取消
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- 标签

export function TagManage({
  tag,
  onChanged,
}: {
  tag: TagInfo & { id: string };
  onChanged?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const guard = useGuard();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(tag.name);
  useConfirmTimeout(confirming, () => setConfirming(false));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    clientSend("PATCH", `/api/admin/tags/${tag.id}`, { name: name.trim() })
      .then(() => {
        toast.push(`标签「${name.trim()}」已重命名`, "success");
        setEditing(false);
        onChanged?.();
        router.refresh();
      })
      .catch((err) => {
        if (!guard(err)) toast.push(err instanceof Error ? err.message : "操作失败", "error");
      })
      .finally(() => setBusy(false));
  };

  const onDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    clientSend("DELETE", `/api/admin/tags/${tag.id}`)
      .then(() => {
        toast.push(`标签「${tag.name}」已删除（作品关联已解除）`, "success");
        onChanged?.();
        router.refresh();
      })
      .catch((err) => {
        if (!guard(err)) toast.push(err instanceof Error ? err.message : "删除失败", "error");
      })
      .finally(() => setBusy(false));
  };

  return (
    <span className="manage-actions tag-manage">
      {editing ? (
        <form className="tag-rename-form" onSubmit={submit}>
          <input
            className="form-input"
            value={name}
            autoFocus
            aria-label={`重命名标签 ${tag.name}`}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            保存
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setEditing(false);
              setName(tag.name);
            }}
          >
            取消
          </button>
        </form>
      ) : (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            重命名
          </button>
          <button
            type="button"
            className={`btn btn-sm${confirming ? " btn-danger" : " btn-ghost"}`}
            disabled={busy}
            onClick={onDelete}
          >
            {confirming ? "确认删除?" : "删除"}
          </button>
        </>
      )}
    </span>
  );
}

export function TagCreateButton({ onChanged }: { onChanged?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const guard = useGuard();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    const body = { name: name.trim(), slug: slugify(name) };
    setBusy(true);
    clientSend("POST", "/api/admin/tags", body)
      .then(() => {
        toast.push(`标签「${body.name}」已创建`, "success");
        setOpen(false);
        setName("");
        onChanged?.();
        router.refresh();
      })
      .catch((err) => {
        if (!guard(err)) toast.push(err instanceof Error ? err.message : "创建失败", "error");
      })
      .finally(() => setBusy(false));
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        ＋ 新建标签
      </button>
    );
  }
  return (
    <form className="inline-edit collections-form" onSubmit={submit}>
      <label className="form-field">
        <span className="form-label">标签名 *</span>
        <input
          className="form-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="如：赛博朋克"
        />
      </label>
      <p className="field-hint">slug 自动生成（纯中文名退化为随机短串，可在重命名时改 slug——此处只建 name/slug 同源）。</p>
      <div className="inline-edit-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          创建标签
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          取消
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- slug 接入槽

/**
 * 专辑管理接入槽：公开字典无 id，按 slug 查 admin 列表补 id。
 * 未登录（401）/ 无匹配（被删或 SSR 陈旧）时静默不渲染——管理按钮仅登录可见。
 */
export function AlbumManageSlot({
  album,
  onChanged,
}: {
  album: AlbumInfo;
  onChanged?: () => void;
}) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    clientGet<{ items: AdminAlbum[] }>("/api/admin/albums")
      .then((res) => {
        if (!alive) return;
        const hit = res.items.find((a) => a.slug === album.slug);
        if (hit) setId(hit.id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [album.slug]);
  if (!id) return null;
  return <AlbumManage album={{ ...album, id }} onChanged={onChanged} />;
}

/**
 * 标签管理接入槽：同 AlbumManageSlot（按 slug 查 admin 列表补 id）。
 */
export function TagManageSlot({
  tag,
  onChanged,
}: {
  tag: TagInfo;
  onChanged?: () => void;
}) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    clientGet<{ items: AdminTag[] }>("/api/admin/tags")
      .then((res) => {
        if (!alive) return;
        const hit = res.items.find((t) => t.slug === tag.slug);
        if (hit) setId(hit.id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tag.slug]);
  if (!id) return null;
  return <TagManage tag={{ ...tag, id }} onChanged={onChanged} />;
}
