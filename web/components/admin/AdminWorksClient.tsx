"use client";

/**
 * /admin 作品管理表（DESIGN 4.3-⑫，M6；无发布流）：
 * - 类型下拉 + 搜索（标题/提示词 LIKE）；
 * - cursor 分页（上一页栈 + 下一页）；stats 摘要条（总数/图片/视频/精选）；
 * - 行内操作：编辑（展开行内表单改标题/提示词/标签/专辑 → PATCH）、
 *   删除二次确认（第一步变「确认删除?」Danger，4s 未确认自动撤销；DELETE ?confirm=true）；
 * - 「登记作品」→ /admin/works/new；缩略图 48px contain（视频用 poster）；
 * - 401 → 跳登录页；操作反馈统一 toast。
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, Fragment, type FormEvent } from "react";

import { useToast } from "@/components/Toast";
import { ApiClientError, buildAdminWorksQuery, clientGet, clientSend, type AdminWorksQuery } from "@/lib/api";
import type { AdminAlbum, AdminTag, AdminWork, AdminWorksPage } from "@/lib/types";

interface Props {
  initial: AdminWorksPage | null;
  initialQuery: AdminWorksQuery;
  albums: AdminAlbum[];
  tags: AdminTag[];
}

interface EditForm {
  title: string;
  prompt: string;
  tagSlugs: string; // 逗号分隔
  albumSlug: string; // "" = 无专辑
}

function parseTagInput(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AdminWorksClient({ initial, initialQuery, albums, tags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [data, setData] = useState<AdminWorksPage | null>(initial);
  const [query, setQuery] = useState<AdminWorksQuery>(initialQuery);
  /** 已访问页的 cursor 栈（栈顶 = 当前页 cursor；空栈 = 第一页） */
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(
    initial ? null : "管理列表加载失败，请确认后端服务已启动。",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(initialQuery.q ?? "");

  const queryRef = useRef(query);
  queryRef.current = query;
  const stackRef = useRef(cursorStack);
  stackRef.current = cursorStack;
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 401 统一跳登录（带 next 回跳）
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

  const load = useCallback(
    async (q: AdminWorksQuery, cursor: string | undefined) => {
      setLoading(true);
      setLoadError(null);
      try {
        const page = await clientGet<AdminWorksPage>(
          `/api/admin/works?${buildAdminWorksQuery({ ...q, cursor, limit: q.limit ?? 20 })}`,
        );
        setData(page);
      } catch (err) {
        if (!guard(err)) {
          setLoadError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        setLoading(false);
      }
    },
    [guard],
  );

  // SSR 不可达时客户端补拉首屏
  useEffect(() => {
    if (!initial) void load(queryRef.current, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 删除二次确认 4s 自动撤销
  useEffect(() => {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    if (deleteConfirmId) {
      deleteTimer.current = setTimeout(() => setDeleteConfirmId(null), 4000);
    }
    return () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
    };
  }, [deleteConfirmId]);

  const reload = useCallback(
    () => load(queryRef.current, stackRef.current[stackRef.current.length - 1]),
    [load],
  );

  /** 行操作统一封装：成功 toast + 重拉当前页（含 stats 刷新） */
  const mutate = useCallback(
    async (fn: () => Promise<unknown>, okMsg: string) => {
      try {
        await fn();
        toast.push(okMsg, "success");
        setEditingId(null);
        setEditForm(null);
        await reload();
      } catch (err) {
        if (!guard(err)) {
          toast.push(err instanceof Error ? err.message : "操作失败", "error");
        }
      } finally {
        setBusyId(null);
      }
    },
    [guard, reload, toast],
  );

  // ---- 筛选 / 搜索 / 分页（均回到第一页或按栈翻页）
  const applyQuery = (patch: Partial<AdminWorksQuery>) => {
    const next = { ...queryRef.current, ...patch };
    setQuery(next);
    queryRef.current = next;
    setCursorStack([]);
    stackRef.current = [];
    setEditingId(null);
    void load(next, undefined);
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    applyQuery({ q: searchInput.trim() || undefined });
  };

  const gotoPage = (dir: "prev" | "next") => {
    const d = data;
    if (!d) return;
    if (dir === "next" && d.next_cursor) {
      const stack = [...stackRef.current, d.next_cursor];
      setCursorStack(stack);
      stackRef.current = stack;
      void load(queryRef.current, d.next_cursor);
    } else if (dir === "prev" && stackRef.current.length > 0) {
      const stack = stackRef.current.slice(0, -1);
      setCursorStack(stack);
      stackRef.current = stack;
      void load(queryRef.current, stack[stack.length - 1]);
    }
  };

  // ---- 行内编辑
  const startEdit = (w: AdminWork) => {
    setEditingId(w.id);
    setEditForm({
      title: w.title,
      prompt: w.prompt,
      tagSlugs: w.tags.map((t) => t.slug).join(", "),
      albumSlug: w.album?.slug ?? "",
    });
  };

  const saveEdit = (w: AdminWork) => {
    if (!editForm) return;
    if (!editForm.prompt.trim()) {
      toast.push("提示词不能为空", "warning");
      return;
    }
    setBusyId(w.id);
    void mutate(
      () =>
        clientSend("PATCH", `/api/admin/works/${w.id}`, {
          title: editForm.title,
          prompt: editForm.prompt,
          tag_slugs: parseTagInput(editForm.tagSlugs),
          album_slug: editForm.albumSlug || null,
        }),
      `已保存「${editForm.title || w.id}」`,
    );
  };

  const onDelete = (w: AdminWork) => {
    if (deleteConfirmId !== w.id) {
      setDeleteConfirmId(w.id); // 第一次点击：进入二次确认态
      return;
    }
    setDeleteConfirmId(null);
    setBusyId(w.id);
    void mutate(
      () => clientSend("DELETE", `/api/admin/works/${w.id}?confirm=true`),
      `已删除「${w.title || w.id}」（外部存储文件保留）`,
    );
  };

  const stats = data?.stats;
  const items = data?.items ?? [];
  const pageNo = cursorStack.length + 1;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Works</p>
          <h1 className="admin-title">作品管理</h1>
        </div>
        <Link href="/admin/works/new" className="btn btn-primary">
          ＋ 登记作品
        </Link>
      </div>

      {/* stats 摘要条 */}
      {stats && (
        <div className="admin-stats mono" aria-label="作品统计">
          <span>共 {stats.total}</span>
          <span>图片 {stats.images}</span>
          <span>视频 {stats.videos}</span>
          <span>精选 {stats.featured}</span>
        </div>
      )}

      {/* 类型 + 搜索 */}
      <div className="admin-toolbar">
        <div className="admin-toolbar-right">
          <select
            className="form-select"
            aria-label="类型筛选"
            value={query.type ?? ""}
            onChange={(e) =>
              applyQuery({ type: (e.target.value || undefined) as AdminWorksQuery["type"] })
            }
          >
            <option value="">全部类型</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
          </select>
          <form className="admin-search" onSubmit={onSearch} role="search">
            <input
              className="form-input"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索标题 / 提示词…"
              aria-label="搜索作品"
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              搜索
            </button>
          </form>
        </div>
      </div>

      {loadError && (
        <div className="admin-error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {/* 作品表 */}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">缩略图</th>
              <th scope="col">标题 / ID</th>
              <th scope="col">类型</th>
              <th scope="col">专辑</th>
              <th scope="col">标签</th>
              <th scope="col">时间</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <Fragment key={w.id}>
                <tr className={editingId === w.id ? "row-editing" : undefined}>
                  <td>
                    <span className="admin-thumb">
                      <img
                        src={(w.type === "video" ? w.poster_url : w.thumb_url) || w.thumb_url || w.media_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    </span>
                  </td>
                  <td className="cell-title">
                    <span className="admin-work-title">
                      {w.featured && <span className="featured-star" title="精选">★</span>}
                      <Link href={`/works/${w.id}`} target="_blank" rel="noreferrer">
                        {w.title || "无题"}
                      </Link>
                    </span>
                    <span className="admin-work-id mono">{w.id}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${w.type}`}>{w.type === "video" ? "视频" : "图片"}</span>
                  </td>
                  <td className="cell-dim">{w.album?.name ?? "—"}</td>
                  <td className="cell-tags">
                    {w.tags.slice(0, 2).map((t) => (
                      <span key={t.slug} className="mini-chip">
                        {t.name}
                      </span>
                    ))}
                    {w.tags.length > 2 && <span className="mini-chip more">+{w.tags.length - 2}</span>}
                    {w.tags.length === 0 && <span className="cell-dim">—</span>}
                  </td>
                  <td className="cell-dim mono">
                    {(w.published_at ?? w.created_at ?? "").slice(0, 10) || "—"}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === w.id}
                        onClick={() => (editingId === w.id ? setEditingId(null) : startEdit(w))}
                      >
                        {editingId === w.id ? "收起" : "编辑"}
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${deleteConfirmId === w.id ? "btn-danger" : "btn-ghost"}`}
                        disabled={busyId === w.id}
                        onClick={() => onDelete(w)}
                      >
                        {deleteConfirmId === w.id ? "确认删除?" : "删除"}
                      </button>
                    </div>
                  </td>
                </tr>

                {/* 行内编辑表单：标题 / 提示词 / 标签 / 专辑 */}
                {editingId === w.id && editForm && (
                  <tr className="row-editor">
                    <td colSpan={8}>
                      <div className="inline-edit">
                        <label className="form-field">
                          <span className="form-label">标题</span>
                          <input
                            className="form-input"
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            placeholder="（可空，展示层降级为提示词摘要）"
                          />
                        </label>
                        <label className="form-field">
                          <span className="form-label">提示词（必填）</span>
                          <textarea
                            className="form-textarea"
                            rows={3}
                            value={editForm.prompt}
                            onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })}
                          />
                        </label>
                        <div className="inline-edit-row">
                          <label className="form-field">
                            <span className="form-label">标签（逗号分隔，缺失自动创建）</span>
                            <input
                              className="form-input"
                              value={editForm.tagSlugs}
                              onChange={(e) => setEditForm({ ...editForm, tagSlugs: e.target.value })}
                              list="admin-tag-options"
                              placeholder="如：城市, 夜景"
                            />
                          </label>
                          <label className="form-field">
                            <span className="form-label">专辑</span>
                            <select
                              className="form-select"
                              value={editForm.albumSlug}
                              onChange={(e) => setEditForm({ ...editForm, albumSlug: e.target.value })}
                            >
                              <option value="">（无专辑）</option>
                              {albums.map((a) => (
                                <option key={a.slug} value={a.slug}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <datalist id="admin-tag-options">
                          {tags.map((t) => (
                            <option key={t.slug} value={t.slug}>
                              {t.name}
                            </option>
                          ))}
                        </datalist>
                        <div className="inline-edit-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busyId === w.id}
                            onClick={() => saveEdit(w)}
                          >
                            {busyId === w.id ? "保存中…" : "保存"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busyId === w.id}
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>

        {!loading && items.length === 0 && !loadError && (
          <p className="admin-empty">
            没有符合条件的作品。<Link href="/admin/works/new">登记第一幅作品 →</Link>
          </p>
        )}
        {loading && <p className="admin-empty">加载中…</p>}
      </div>

      {/* 分页（cursor 栈） */}
      <div className="admin-pagination">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={cursorStack.length === 0 || loading}
          onClick={() => gotoPage("prev")}
        >
          ‹ 上一页
        </button>
        <span className="admin-page-no mono">第 {pageNo} 页</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!data?.has_more || loading}
          onClick={() => gotoPage("next")}
        >
          下一页 ›
        </button>
      </div>
    </div>
  );
}
