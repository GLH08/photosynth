"use client";

/**
 * 专辑与标签管理（DESIGN 4.3-⑫，M6）：
 * - 专辑：新建 / 行内编辑（名称/slug/简介/kind/封面/排序）/ 删除（二次确认，
 *   删除后作品自动解除关联 ON DELETE SET NULL）；slug 唯一冲突 409 → toast；
 * - 标签：新建 / 改名改 slug / 删除（二次确认，自动解除作品关联）；
 * - slug 自动生成（名称 → 小写连字符；纯中文名退化为随机短串，可手改）。
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useToast } from "@/components/Toast";
import { ApiClientError, clientGet, clientSend } from "@/lib/api";
import type { AdminAlbum, AdminTag, AlbumKind } from "@/lib/types";
import { usePathname, useRouter } from "next/navigation";

interface Props {
  initialAlbums: AdminAlbum[];
  initialTags: AdminTag[];
}

interface AlbumForm {
  id?: string; // 有 id = 编辑；无 = 新建
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  kind: AlbumKind;
  cover_url: string;
  sort_weight: string;
}

interface TagForm {
  id?: string;
  name: string;
  slug: string;
  slugTouched: boolean;
}

/** slug 自动生成：小写、非 ASCII（含中文）折叠为 -；全空退化随机短串（可手改） */
export function slugify(input: string): string {
  const ascii = input
    .trim()
    .toLowerCase()
    .replace(/['"()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `id-${Date.now().toString(36)}`;
}

const KIND_LABEL: Record<AlbumKind, string> = {
  image: "图片专辑",
  video: "视频专辑",
  mixed: "图文混合",
};

export default function CollectionsClient({ initialAlbums, initialTags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [albums, setAlbums] = useState<AdminAlbum[]>(initialAlbums);
  const [tags, setTags] = useState<AdminTag[]>(initialTags);
  const [albumForm, setAlbumForm] = useState<AlbumForm | null>(null);
  const [tagForm, setTagForm] = useState<TagForm | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "album" | "tag"; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guard = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiClientError && err.status === 401) {
        router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        return true;
      }
      return false;
    },
    [router, pathname],
  );

  // 删除二次确认 4s 自动撤销
  useEffect(() => {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    if (deleteConfirm) {
      deleteTimer.current = setTimeout(() => setDeleteConfirm(null), 4000);
    }
    return () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
    };
  }, [deleteConfirm]);

  const reload = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([
        clientGet<{ items: AdminAlbum[] }>("/api/admin/albums"),
        clientGet<{ items: AdminTag[] }>("/api/admin/tags"),
      ]);
      setAlbums(a.items);
      setTags(t.items);
    } catch (err) {
      if (!guard(err)) toast.push("列表刷新失败", "error");
    }
  }, [guard, toast]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>, okMsg: string, close: () => void) => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
        toast.push(okMsg, "success");
        close();
        await reload();
      } catch (err) {
        if (!guard(err)) {
          toast.push(err instanceof Error ? err.message : "操作失败", "error");
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, guard, reload, toast],
  );

  // ---- 专辑表单
  const startAlbum = (a?: AdminAlbum) => {
    setAlbumForm(
      a
        ? {
            id: a.id,
            name: a.name,
            slug: a.slug,
            slugTouched: true,
            description: a.description,
            kind: a.kind,
            cover_url: a.cover_url ?? "",
            sort_weight: String(a.sort_weight ?? 0),
          }
        : { name: "", slug: "", slugTouched: false, description: "", kind: "mixed", cover_url: "", sort_weight: "0" },
    );
  };

  const onAlbumName = (name: string) =>
    setAlbumForm((prev) =>
      prev ? { ...prev, name, slug: prev.slugTouched ? prev.slug : slugify(name) } : prev,
    );

  const submitAlbum = (e: FormEvent) => {
    e.preventDefault();
    const f = albumForm;
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
    void mutate(
      () =>
        f.id
          ? clientSend("PATCH", `/api/admin/albums/${f.id}`, body)
          : clientSend("POST", "/api/admin/albums", body),
      f.id ? `专辑「${body.name}」已更新` : `专辑「${body.name}」已创建`,
      () => setAlbumForm(null),
    );
  };

  const deleteAlbum = (a: AdminAlbum) => {
    if (deleteConfirm?.kind !== "album" || deleteConfirm.id !== a.id) {
      setDeleteConfirm({ kind: "album", id: a.id }); // 第一次点击：进入二次确认态
      return;
    }
    setDeleteConfirm(null);
    void mutate(
      () => clientSend("DELETE", `/api/admin/albums/${a.id}`),
      `专辑「${a.name}」已删除（作品保留并解除关联）`,
      () => undefined,
    );
  };

  // ---- 标签表单
  const startTag = (t?: AdminTag) => {
    setTagForm(
      t
        ? { id: t.id, name: t.name, slug: t.slug, slugTouched: true }
        : { name: "", slug: "", slugTouched: false },
    );
  };

  const onTagName = (name: string) =>
    setTagForm((prev) =>
      prev ? { ...prev, name, slug: prev.slugTouched ? prev.slug : slugify(name) } : prev,
    );

  const submitTag = (e: FormEvent) => {
    e.preventDefault();
    const f = tagForm;
    if (!f || busy) return;
    if (!f.name.trim()) {
      toast.push("标签名必填", "warning");
      return;
    }
    const body = { name: f.name.trim(), slug: f.slug.trim() || slugify(f.name) };
    void mutate(
      () =>
        f.id
          ? clientSend("PATCH", `/api/admin/tags/${f.id}`, body)
          : clientSend("POST", "/api/admin/tags", body),
      f.id ? `标签「${body.name}」已更新` : `标签「${body.name}」已创建`,
      () => setTagForm(null),
    );
  };

  const deleteTag = (t: AdminTag) => {
    if (deleteConfirm?.kind !== "tag" || deleteConfirm.id !== t.id) {
      setDeleteConfirm({ kind: "tag", id: t.id });
      return;
    }
    setDeleteConfirm(null);
    void mutate(
      () => clientSend("DELETE", `/api/admin/tags/${t.id}`),
      `标签「${t.name}」已删除（作品关联已解除）`,
      () => undefined,
    );
  };

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Collections</p>
          <h1 className="admin-title">专辑与标签</h1>
        </div>
      </div>

      {/* ---------- 专辑 ---------- */}
      <section className="form-section" aria-label="专辑管理">
        <div className="section-head">
          <h2 className="form-section-title" style={{ marginBottom: 0 }}>
            专辑 · {albums.length}
          </h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => startAlbum()}>
            ＋ 新建专辑
          </button>
        </div>

        {albumForm && (
          <form className="inline-edit collections-form" onSubmit={submitAlbum}>
            <div className="inline-edit-row">
              <label className="form-field">
                <span className="form-label">名称 *</span>
                <input
                  className="form-input"
                  value={albumForm.name}
                  onChange={(e) => onAlbumName(e.target.value)}
                  placeholder="如：城市印象"
                  autoFocus
                />
              </label>
              <label className="form-field">
                <span className="form-label">slug（自动按名称生成，可改）</span>
                <input
                  className="form-input mono"
                  value={albumForm.slug}
                  onChange={(e) =>
                    setAlbumForm({ ...albumForm, slug: e.target.value, slugTouched: true })
                  }
                  placeholder="city-impressions"
                />
              </label>
            </div>
            <div className="inline-edit-row">
              <label className="form-field">
                <span className="form-label">kind 内容类型</span>
                <select
                  className="form-select"
                  value={albumForm.kind}
                  onChange={(e) =>
                    setAlbumForm({ ...albumForm, kind: e.target.value as AlbumKind })
                  }
                >
                  <option value="mixed">mixed · 图文混合</option>
                  <option value="image">image · 图片专辑</option>
                  <option value="video">video · 视频专辑</option>
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">排序权重（越大越靠前）</span>
                <input
                  className="form-input mono"
                  type="number"
                  value={albumForm.sort_weight}
                  onChange={(e) => setAlbumForm({ ...albumForm, sort_weight: e.target.value })}
                />
              </label>
            </div>
            <label className="form-field">
              <span className="form-label">封面 cover_url（HTTPS，可空 = 取首张作品缩略图）</span>
              <input
                className="form-input mono"
                value={albumForm.cover_url}
                onChange={(e) => setAlbumForm({ ...albumForm, cover_url: e.target.value })}
                placeholder="https://cdn.example.com/cover.jpg"
              />
            </label>
            <label className="form-field">
              <span className="form-label">简介</span>
              <textarea
                className="form-textarea"
                rows={2}
                value={albumForm.description}
                onChange={(e) => setAlbumForm({ ...albumForm, description: e.target.value })}
              />
            </label>
            <div className="inline-edit-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                {albumForm.id ? "保存修改" : "创建专辑"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlbumForm(null)}>
                取消
              </button>
            </div>
          </form>
        )}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">slug</th>
                <th scope="col">类型</th>
                <th scope="col">作品数</th>
                <th scope="col">权重</th>
                <th scope="col">简介</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {albums.map((a) => (
                <tr key={a.id}>
                  <td className="cell-title">{a.name}</td>
                  <td className="cell-dim mono">{a.slug}</td>
                  <td>
                    <span className="badge badge-kind">{KIND_LABEL[a.kind] ?? a.kind}</span>
                  </td>
                  <td className="mono">{a.work_count}</td>
                  <td className="cell-dim mono">{a.sort_weight}</td>
                  <td className="cell-dim cell-desc">{a.description || "—"}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => startAlbum(a)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${deleteConfirm?.kind === "album" && deleteConfirm.id === a.id ? "btn-danger" : "btn-ghost"}`}
                        disabled={busy}
                        onClick={() => deleteAlbum(a)}
                      >
                        {deleteConfirm?.kind === "album" && deleteConfirm.id === a.id
                          ? "确认删除?"
                          : "删除"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {albums.length === 0 && <p className="admin-empty">还没有专辑，点上方「新建专辑」创建。</p>}
        </div>
      </section>

      {/* ---------- 标签 ---------- */}
      <section className="form-section" aria-label="标签管理">
        <div className="section-head">
          <h2 className="form-section-title" style={{ marginBottom: 0 }}>
            标签 · {tags.length}
          </h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => startTag()}>
            ＋ 新建标签
          </button>
        </div>

        {tagForm && (
          <form className="inline-edit collections-form" onSubmit={submitTag}>
            <div className="inline-edit-row">
              <label className="form-field">
                <span className="form-label">标签名 *</span>
                <input
                  className="form-input"
                  value={tagForm.name}
                  onChange={(e) => onTagName(e.target.value)}
                  placeholder="如：赛博朋克"
                  autoFocus
                />
              </label>
              <label className="form-field">
                <span className="form-label">slug（自动生成，可改）</span>
                <input
                  className="form-input mono"
                  value={tagForm.slug}
                  onChange={(e) =>
                    setTagForm({ ...tagForm, slug: e.target.value, slugTouched: true })
                  }
                  placeholder="cyberpunk"
                />
              </label>
            </div>
            <p className="field-hint">纯中文名会生成随机 slug（URL 需 ASCII），可手动改为英文。</p>
            <div className="inline-edit-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                {tagForm.id ? "保存修改" : "创建标签"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTagForm(null)}>
                取消
              </button>
            </div>
          </form>
        )}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">标签名</th>
                <th scope="col">slug</th>
                <th scope="col">作品数</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td className="cell-title">{t.name}</td>
                  <td className="cell-dim mono">{t.slug}</td>
                  <td className="mono">{t.count}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => startTag(t)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${deleteConfirm?.kind === "tag" && deleteConfirm.id === t.id ? "btn-danger" : "btn-ghost"}`}
                        disabled={busy}
                        onClick={() => deleteTag(t)}
                      >
                        {deleteConfirm?.kind === "tag" && deleteConfirm.id === t.id
                          ? "确认删除?"
                          : "删除"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tags.length === 0 && <p className="admin-empty">还没有标签，点上方「新建标签」创建。</p>}
        </div>
      </section>
    </div>
  );
}
