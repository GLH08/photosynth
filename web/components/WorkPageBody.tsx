"use client";

/**
 * /works/[id] 直访形态（DESIGN 4.3-⑧ / 5.6「独立详情页复用」）：
 * 居中双栏卡片（左媒体右信息，同 lightbox 信息架构），共享 WorkMedia / WorkDetailPanel。
 */
import { useState } from "react";

import WorkDetailPanel from "./WorkDetailPanel";
import WorkMedia from "./WorkMedia";
import type { WorkDetail } from "@/lib/types";

export default function WorkPageBody({ work }: { work: WorkDetail }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <div className="work-standalone">
      <div className="work-standalone-media">
        <WorkMedia work={work} previewUrl={previewUrl} onExitPreview={() => setPreviewUrl(null)} />
      </div>
      <div className="work-standalone-info">
        <WorkDetailPanel work={work} previewUrl={previewUrl} onPreviewRef={setPreviewUrl} />
      </div>
    </div>
  );
}
