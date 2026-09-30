"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Panel, Table, Td, Tr, btnCls } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { type EarChannel, type EarDripFeedbackVersion, earChannelLabel, listEarDripFeedbackVersions } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";

/** 표본이 이 미만이면 평균을 "참고"로 표시한다(drip-feedback.md 4.5) */
const SMALL_SAMPLE = 20;
const STARS = ["1", "2", "3", "4", "5"] as const;

/**
 * 버전별 별점 표. 실배포(운영)가 기본이고, 개발계 토글은 추천 테스트 계정으로 팝업 흐름을 검증할 때 쓴다.
 * 채널을 바꾸면 EarGate 를 다시 마운트해 그 서버의 관리자 세션으로 붙는다.
 */
export function DripFeedbackVersions() {
  const [channel, setChannel] = useState<EarChannel>("prod");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["prod", "dev"] as const).map((ch) => (
          <button key={ch} type="button" onClick={() => setChannel(ch)} className={`rounded-full border px-3 py-1 text-xs ${channel === ch ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}>
            {earChannelLabel(ch)}{ch === "prod" ? " (실배포)" : ""}
          </button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <VersionsTable channel={channel} />
      </EarGate>
    </div>
  );
}

function VersionsTable({ channel }: { channel: EarChannel }) {
  const [items, setItems] = useState<EarDripFeedbackVersion[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setItems((await listEarDripFeedbackVersions(channel)).items); }
    catch (e) { setErr(earErrMsg(e)); }
    finally { setLoading(false); }
  }, [channel]);

  useEffect(() => {
    // 마운트 직후 1회 — 효과 안에서 바로 setState 하지 않도록 한 틱 미룬다
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const totalRatings = (items ?? []).reduce((s, v) => s + v.ratings, 0);
  const totalPlacements = (items ?? []).reduce((s, v) => s + v.placements, 0);

  return (
    <Panel
      title={`알고리즘 버전 ${items?.length ?? 0}개 — 평가 ${totalRatings}건 / 편성 ${totalPlacements}편`}
      right={<button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>}
      flush
    >
      {err && <p className="px-4 py-3 text-[13px] text-rose-700">{err}</p>}
      <Table head={["버전", "편성", "기간", "평가 (응답률)", "평균 ★", "분포 1 → 5", ""]} empty={items === null ? "불러오는 중…" : "아직 편성분이 없다 — 편성 배치가 돈 뒤부터 버전이 쌓인다"}>
        {(items ?? []).map((v) => {
          const rate = v.placements > 0 ? v.ratings / v.placements : 0;
          const small = v.ratings > 0 && v.ratings < SMALL_SAMPLE;
          const max = Math.max(1, ...STARS.map((s) => v.distribution[s]));
          return (
            <Tr key={v.algorithm_version ?? "legacy"}>
              <Td className="font-mono text-[12.5px]">{v.algorithm_version ?? <span className="text-ink-soft">버전 도입 전</span>}</Td>
              <Td className="tabular-nums">{v.placements}편 · {v.placed_users}명</Td>
              <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtTime(v.first_placed_at)} ~ {fmtTime(v.last_placed_at)}</Td>
              <Td className="tabular-nums">{v.ratings}건 · {v.rated_users}명 <span className="text-ink-soft">({(rate * 100).toFixed(1)}%)</span></Td>
              <Td className="tabular-nums text-[15px] font-semibold text-ink">{v.average_stars === null ? <span className="text-ink-soft">–</span> : v.average_stars.toFixed(2)}</Td>
              <Td>
                <div className="flex items-end gap-1" title={STARS.map((s) => `${s}★ ${v.distribution[s]}`).join(" · ")}>
                  {STARS.map((s) => (
                    <div key={s} className="flex w-6 flex-col items-center gap-0.5">
                      <div className="w-full rounded-t bg-brand/80" style={{ height: `${Math.max(2, (v.distribution[s] / max) * 28)}px` }} />
                      <span className="text-[10px] tabular-nums text-ink-soft">{v.distribution[s]}</span>
                    </div>
                  ))}
                </div>
              </Td>
              <Td>{small && <Badge tone="queued">표본 {SMALL_SAMPLE}건 미만 — 참고</Badge>}{v.ratings === 0 && <span className="text-xs text-ink-soft">평가 없음</span>}</Td>
            </Tr>
          );
        })}
      </Table>
      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-soft">
        편성·평가 수는 드립·탐험 편성분 기준(삭제분 포함), 팝업은 정규 편만 묻는다. 버전 간 비교는 사람이 한다 — 표본이 작을 때 평균만 보고 판단하지 않는다. 별점은 추천 입력에 반영되지 않는다.
      </p>
    </Panel>
  );
}
