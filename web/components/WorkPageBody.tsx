"use client";

/**
 * /works/[id] 直访形态（DESIGN 4.3-⑧ / 5.6「独立详情页复用」）：
 * 居中双栏卡片（左媒体右信息，同 lightbox 信息架构），共享 WorkMedia / WorkDetailPanel。
 * 前台管理（Build-E【2】）：编辑/删除按钮常驻；删除成功回 /gallery。
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

import WorkDetailPanel from "./WorkDetailPanel";
import WorkMedia from "./WorkMedia";
import type { WorkDetail } from "@/lib/types";

export default function WorkPageBody({ work: initialWork }: { work: WorkDetail }) {
  const router = useRouter();
  const [work, setWork] = useState<WorkDetail>(initialWork);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <div className="work-standalone">
      <div className="work-standalone-media">
        <WorkMedia work={work} previewUrl={previewUrl} onExitPreview={() => setPreviewUrl(null)} />
      </div>
      <div className="work-standalone-info">
        <WorkDetailPanel
          work={work}
          previewUrl={previewUrl}
          onPreviewRef={setPreviewUrl}
          manage
          onFeaturedChange={(next) => setWork((w) => ({ ...w, featured: next }))}
          onDeleted={() => router.replace("/gallery")}
        />
      </div>
    </div>
  );
}
