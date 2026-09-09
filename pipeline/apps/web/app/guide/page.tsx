import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { PageHeader, Panel } from "@/components/ui";

/**
 * 가이드 — 운영 문서 RUNBOOK.md 를 콘솔 안에서 읽는다 (2026-09-09 박수헌: 파일이 아니라 콘솔 탭으로).
 * 원본은 pipeline/RUNBOOK.md 하나다 — 여기서는 렌더만 하고 내용을 따로 두지 않는다 (이중 관리 방지).
 * 실행 cwd 는 apps/web (npm -w) 이므로 두 단계 위가 pipeline/. 이미지에는 COPY . . 로 들어온다.
 */
export const dynamic = "force-dynamic";

async function loadRunbook(): Promise<string | null> {
  const candidates = [path.resolve(process.cwd(), "..", "..", "RUNBOOK.md"), path.resolve(process.cwd(), "RUNBOOK.md")];
  for (const p of candidates) { try { return await fs.readFile(p, "utf8"); } catch { /* 다음 후보 */ } }
  return null;
}

export default async function GuidePage() {
  const md = await loadRunbook();
  const html = md ? await marked.parse(md.replace(/^# .*\n/, ""), { gfm: true }) : null; // 첫 줄 제목은 PageHeader 가 맡는다
  return (
    <div className="space-y-3">
      <PageHeader title="가이드" breadcrumb={["파이프라인", "가이드"]} desc="파이프라인을 돌리는 법 — 켜기 · 한 편이 지나가는 길 · 막혔을 때 · 설정 토글. 원본은 레포의 pipeline/RUNBOOK.md." />
      <Panel>
        {html
          ? <article className="guide max-w-[880px] text-[13.5px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: html }} />
          : <p className="text-[13px] text-rose-700">RUNBOOK.md 를 읽지 못했습니다 — 배포 이미지에 파일이 없거나 경로가 다릅니다.</p>}
      </Panel>
    </div>
  );
}
