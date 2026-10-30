"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui";
import { listPublishableEpisodes } from "../../actions";
import { EarGate, EarSession } from "../../publish/ear-connect";
import { BulkPublish, type PendingEpisode } from "../../publish/upload/bulk-publish";

/**
 * 짧은 판 일괄 발행 (KAN-296 · KAN-298 — 2026-10-31 박수헌 "실험 탭에 일괄 발행 만들어").
 * 업로드 화면의 일괄 발행과 같은 화면을 짧은 판 모드로 쓴다 — 패키지까지 끝난 짧은 판 단편만 보이고, 편마다 원본의 변형으로 올라간다.
 * 실험 탭은 20초마다 새로 고쳐서(AutoRefresh) 발행 도중 목록이 다시 읽히지 않게 따로 둔다.
 */
export default function ShortBulkPublishPage() {
  return (
    <div className="space-y-3">
      <PageHeader title="짧은 판 일괄 발행" breadcrumb={["파이프라인", "실험", "일괄 발행"]}
        desc="패키지까지 끝난 짧은 판 단편을 골라 한 번에 올린다. 편마다 원본 제품 콘텐츠의 변형(length_profile short)으로 올라가고, 서버가 짧은 판 코호트에게만 보여 준다 — 코호트 경계가 비어 있으면 아무에게도 안 보인다. 시리즈 짧은 판은 시리즈 화면의 [시리즈 발행]."
        actions={<EarSession />} />
      <EarGate><ShortBulk /></EarGate>
    </div>
  );
}

function ShortBulk() {
  const [pending, setPending] = useState<PendingEpisode[] | null>(null);
  const load = useCallback(() => listPublishableEpisodes("short").then(setPending).catch(() => setPending([])), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="space-y-3">
      <Link href="/experiments" className="inline-block text-xs text-ink-soft underline hover:text-ink">← 실험 탭</Link>
      {pending === null
        ? <Panel title="짧은 판 발행 대기 — 패키지 · 오디오 완료 (미발행)"><p className="text-[13px] text-ink-soft">불러오는 중…</p></Panel>
        : <BulkPublish key={pending.map((p) => p.id).join(",")} pending={pending} onDone={() => void load()} short />}
    </div>
  );
}
