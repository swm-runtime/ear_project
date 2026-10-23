"use client";
import { useCallback, useEffect, useState } from "react";
import { Panel, Stat, Table, Td, Tr, btnCls } from "@/components/ui";
import {
  EarApiError, type EarChannel, type EarInspectorCandidate, type EarInspectorDetail, type EarInspectorPick, type EarInspectorSort,
  type EarInspectorUsers, earChannelLabel, getEarInspectorDetail, getEarInspectorUsers,
} from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { TIER_LABEL, fmtInt, fmtKstDate, fmtListenSec, fmtPct, labelOf, shortId } from "@/lib/insights-format";
import {
  AUTO_EXPAND_ACTION_LABEL, AUTO_EXPAND_REASON_LABEL, AXIS_LABEL, DELIVERY_SOURCE_LABEL, EXCLUDED_REASON_LABEL, INTEREST_SOURCE_LABEL,
  LIBRARY_STATUS_LABEL, SIGNAL_ACTION_LABEL, SKIP_REASON_LABEL, axisContributions, fmtCounts, fmtScore, fmtStars, fmtWeight,
} from "@/lib/recommendation-inspector-format";

/**
 * 서비스 지표 "추천 검증" — 가명 사용자(`user_id` 앞 8자리)를 골라 무엇을 들었고, 추천이 무엇을 보냈고, 지금 계산하면 점수가
 * 어떻게 나오는지 본다(`GET /admin/insights/recommendations/*`). 서비스 지표 탭과 같이 **열 때 1회 + [새로고침]**만 요청한다.
 *
 * 상세를 열 때마다 서버가 감사 로그를 남기므로 상세는 사용자를 **클릭했을 때만** 부른다(목록을 열었다고 부르지 않는다).
 */
export function RecommendationInspector() {
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
        <InspectorView channel={channel} />
      </EarGate>
    </div>
  );
}

function InspectorView({ channel }: { channel: EarChannel }) {
  const [sort, setSort] = useState<EarInspectorSort>("listen");
  const [list, setList] = useState<EarInspectorUsers | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    try {
      setList(await getEarInspectorUsers(channel, sort));
    } catch (e) {
      // 404 = 이 서버에 엔드포인트가 아직 없다(백엔드 PR 이 개발계에 먼저 나가고 운영은 다음 main 배포 때)
      if (e instanceof EarApiError && e.status === 404) setNotDeployed(true);
      else setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [channel, sort]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (notDeployed) {
    return <p className="text-[13px] text-amber-800">이 서버({earChannelLabel(channel)})에는 추천 검증 API 가 아직 배포되지 않았어요 — 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어갑니다.</p>;
  }

  return (
    <div className="space-y-3">
      <PrivacyNote />
      <Panel
        title={`후보 사용자 ${list ? `${list.users.length}명` : ""} — 최근 30일`}
        right={
          <span className="flex items-center gap-2">
            {(["listen", "recent"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSort(s)} className={`rounded-full border px-3 py-1 text-xs ${sort === s ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}>
                {s === "listen" ? "많이 들은 순" : "최근 활동 순"}
              </button>
            ))}
            <button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>
          </span>
        }
        flush
      >
        {err ? <p className="px-4 py-3 text-[13px] text-rose-700">{err}</p> : !list ? <p className="px-4 py-3 text-[13px] text-ink-soft">불러오는 중…</p> : (
          <Table head={["#", "사용자", "티어", "시장", "관심 주제", "재생 (30일)", "청취 시간", "완청", "가입", "마지막 재생"]} empty="대상 사용자가 없다">
            {list.users.map((u, i) => (
              <Tr key={u.user_id}>
                <Td className="tabular-nums text-ink-soft">{i + 1}</Td>
                <Td>
                  <button type="button" onClick={() => setSelected(u.user_id)} className={`font-mono text-[12px] underline-offset-2 hover:underline ${selected === u.user_id ? "font-semibold text-brand-ink" : "text-ink"}`} title="상세 보기 — 열 때마다 감사 로그가 남는다">
                    {shortId(u.user_id)}
                  </button>
                </Td>
                <Td>{labelOf(TIER_LABEL, u.tier, u.tier)}</Td>
                <Td className="uppercase text-ink-soft">{u.market}</Td>
                <Td className="tabular-nums">{u.interest_count}</Td>
                <Td className="tabular-nums">{u.plays_30d}회</Td>
                <Td className="tabular-nums">{fmtListenSec(u.listen_sec_30d)}</Td>
                <Td className="tabular-nums">{u.completes_30d}회</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtKstDate(u.signed_up_at)}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtKstDate(u.last_played_at)}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>
      {selected && <InspectorDetailView key={`${channel}-${selected}`} channel={channel} userId={selected} />}
    </div>
  );
}

function InspectorDetailView({ channel, userId }: { channel: EarChannel; userId: string }) {
  const [data, setData] = useState<EarInspectorDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await getEarInspectorDetail(channel, userId));
    } catch (e) {
      setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [channel, userId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const header = (
    <div className="flex items-center gap-2">
      <SectionTitle>사용자 <span className="font-mono normal-case">{shortId(userId)}</span></SectionTitle>
      <span className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
        {data && <span>{new Date(data.generated_at).toLocaleTimeString("ko-KR", { hour12: false })} 기준</span>}
        {/* 편성 미리보기는 운영 서버만 본다 — 같은 가명 id 로 연다(열면 그쪽도 감사 로그를 남긴다) */}
        {channel === "prod" && (
          <a href={`/drip-check?user_id=${encodeURIComponent(userId)}`} className={btnCls("ghost")} title="이 사용자의 편성 미리보기 — 점수 분해 전체">
            편성 미리보기 →
          </a>
        )}
        <button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>
      </span>
    </div>
  );

  if (err) return <div className="space-y-2">{header}<p className="text-[13px] text-rose-700">{err}</p></div>;
  if (!data) return <div className="space-y-2">{header}<p className="text-[13px] text-ink-soft">불러오는 중…</p></div>;

  const p = data.profile;
  const ex = data.explanation;

  return (
    <div className="space-y-3">
      {header}

      {/* ── 프로필 ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="티어 · 시장" value={`${labelOf(TIER_LABEL, p.tier, p.tier)} · ${p.market.toUpperCase()}`} />
        <Stat label="가입" value={fmtKstDate(p.signed_up_at)} sub={p.onboarding_completed ? `온보딩 완료 ${fmtKstDate(p.onboarding_completed_at)}` : `온보딩 중 (${p.onboarding_step})`} />
        <Stat label="커리어" value={p.job_category ?? "-"} sub={`연차 ${p.years_of_experience ?? "-"}년+ · ${p.career_used ? "커리어 적합도에 쓰임" : "이 시장은 쓰지 않음"}`} />
        <Stat label="자동 확장 설정" value={p.is_auto_expand_enabled ? "켜짐" : "꺼짐"} sub="사용자 토글(FR-06)" />
        <Stat label="취향 신호" value={fmtInt(ex.preference.signal_total)} sub={fmtCounts(ex.preference.signal_actions, SIGNAL_ACTION_LABEL)} />
        <Stat label="완청 · 콜드스타트" value={`${fmtInt(ex.preference.complete_signal_count)} · ${ex.preference.is_cold_start ? "예" : "아니오"}`} sub={`완청 ${ex.preference.cold_start_threshold}건 미만이면 콜드스타트`} />
      </div>

      {/* ── 관심 주제 ── */}
      <Panel title={`관심 주제 ${data.interests.length}개 (해제·만료 포함)`} flush>
        <Table head={["주제", "출처", "상태", "추가", "비활성화"]} empty="관심 주제 행이 없다">
          {data.interests.map((i) => (
            <Tr key={i.topic_id}>
              <Td className="font-medium">{i.name ?? "(지워진 주제)"}{i.is_topic_visible === false && <span className="ml-1 text-xs text-ink-soft">숨김</span>}</Td>
              <Td>{labelOf(INTEREST_SOURCE_LABEL, i.source, i.source)}</Td>
              <Td>{i.is_active ? "활성" : i.is_user_removed ? <span className="text-rose-700">직접 해제</span> : <span className="text-ink-soft">비활성</span>}</Td>
              <Td className="whitespace-nowrap text-ink-soft">{fmtKstDate(i.added_at)}</Td>
              <Td className="whitespace-nowrap text-ink-soft">{fmtKstDate(i.deactivated_at)}</Td>
            </Tr>
          ))}
        </Table>
      </Panel>

      {/* ── 청취 ── */}
      <Panel title={`최근 30일 청취 ${data.listening.items.length}편 (최대 50 · 최근 활동 순)`} flush>
        <Table head={["콘텐츠", "주제", "길이", "들은 날", "청취 시간", "도달", "완청", "담기", "마지막 재생"]} empty="최근 30일 재생·완청·담기 기록이 없다">
          {data.listening.items.map((l) => (
            <Tr key={l.content_id}>
              <Td className="max-w-[300px] truncate font-medium">{l.title}</Td>
              <Td className="text-ink-soft">{l.topics.map((t) => t.name).join(", ") || "-"}</Td>
              <Td className="tabular-nums text-ink-soft">{fmtListenSec(l.duration_sec)}</Td>
              <Td className="tabular-nums">{l.play_days}일</Td>
              <Td className="tabular-nums">{fmtListenSec(l.listen_sec)}</Td>
              <Td className="tabular-nums">{fmtPct(l.listened_ratio, 0)}</Td>
              <Td className="tabular-nums">{l.complete_count > 0 ? `${l.complete_count}회 · ${fmtKstDate(l.last_completed_at)}` : "-"}</Td>
              <Td className="whitespace-nowrap text-ink-soft">{fmtKstDate(l.saved_at)}</Td>
              <Td className="whitespace-nowrap text-ink-soft">{fmtKstDate(l.last_played_at)}</Td>
            </Tr>
          ))}
        </Table>
      </Panel>

      {/* ── 편성 이력 ── */}
      <Panel title={`최근 14일 편성 ${data.deliveries.items.length}편 (정규·탐험 · 삭제분 포함)`} flush>
        <Table head={["서비스 날짜", "슬롯", "콘텐츠", "주제", "알고리즘", "상태", "그 뒤 재생", "완청", "별점"]} empty="최근 14일 편성 기록이 없다">
          {data.deliveries.items.map((d) => (
            <Tr key={`${d.content_id}-${d.added_at}`}>
              <Td className="whitespace-nowrap tabular-nums">{d.service_date}</Td>
              <Td>{labelOf(DELIVERY_SOURCE_LABEL, d.source, d.source)}</Td>
              <Td className="max-w-[280px] truncate font-medium">{d.title}</Td>
              <Td className="text-ink-soft">{d.topics.map((t) => t.name).join(", ") || "-"}</Td>
              <Td className="font-mono text-[11px] text-ink-soft">{d.algorithm_version ?? "첫 드립"}</Td>
              <Td>{labelOf(LIBRARY_STATUS_LABEL, d.status, d.status)}{d.deleted && <span className="ml-1 text-xs text-rose-700">삭제</span>}</Td>
              <Td>{d.played_after ? "예" : <span className="text-ink-soft">아니오</span>}</Td>
              <Td>{d.completed_after ? "예" : <span className="text-ink-soft">아니오</span>}</Td>
              <Td className="whitespace-nowrap text-amber-600">{fmtStars(d.feedback_stars)}</Td>
            </Tr>
          ))}
        </Table>
      </Panel>

      {/* ── 추천 재계산 ── */}
      <SectionTitle>추천 계산 — 지금 배치를 돌리면</SectionTitle>
      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
        <b>{ex.notice}.</b> 점수는 저장되지 않는다 — 과거 편성분의 점수는 그날 배치 로그(<code>drip pick scored</code>)에만 있다. 계산 {new Date(ex.computed_at).toLocaleString("ko-KR", { hour12: false })} · 서비스 날짜 {ex.service_date}.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="배치라면" value={ex.skip_reason ? "건너뜀" : "편성"} sub={ex.skip_reason ? labelOf(SKIP_REASON_LABEL, ex.skip_reason, ex.skip_reason) : "스킵 사유 없음"} tone={ex.skip_reason ? "text-amber-700" : "text-brand-ink"} />
        <Stat label="편수 (정규 · 탐험)" value={`${ex.drip_count ?? "-"} · ${ex.discovery_count ?? "-"}`} sub="티어 플랜 기준" />
        <Stat label="미청취 재고" value={`${ex.unfinished_count ?? "-"} / ${ex.unfinished_limit}`} sub={`${ex.unfinished_limit}편 이상이면 건너뜀`} />
        <Stat label="후보 풀 (정규 · 탐험)" value={`${ex.regular?.pool_size ?? "-"} · ${ex.discovery?.pool_size ?? "-"}`} sub="SQL 필터를 지난 콘텐츠 수" />
        <Stat label="빼는 이력" value={`${fmtInt(ex.exclusion_sources.library_contents)} · ${fmtInt(ex.exclusion_sources.permanently_excluded)}`} sub="라이브러리에 있었던 편 · 영구 제외" />
        <Stat label="자동 확장" value={ex.auto_expand ? labelOf(AUTO_EXPAND_ACTION_LABEL, ex.auto_expand.action, ex.auto_expand.action) : "-"} sub={ex.auto_expand ? `${labelOf(AUTO_EXPAND_REASON_LABEL, ex.auto_expand.reason, ex.auto_expand.reason)}${ex.auto_expand.add_topic ? ` · +${ex.auto_expand.add_topic.name}` : ""}${ex.auto_expand.remove_topic ? ` · −${ex.auto_expand.remove_topic.name}` : ""}` : "관심 주제 없음"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="가중치" flush>
          <Table head={["구분", "항목", "가중치"]}>
            {[
              ...Object.entries(ex.weights.axes).map(([k, v]) => ["축", AXIS_LABEL[k as keyof typeof AXIS_LABEL] ?? k, v] as const),
              ...Object.entries(ex.weights.signal_items).map(([k, v]) => ["신호 축", k, v] as const),
              ...Object.entries(ex.preference.is_cold_start ? ex.weights.meta_items_cold_start : ex.weights.meta_items).map(([k, v]) => [ex.preference.is_cold_start ? "메타 축(콜드스타트)" : "메타 축", k, v] as const),
              ...Object.entries(ex.weights.discovery_items).map(([k, v]) => ["탐험", k, v] as const),
            ].map(([group, key, v]) => (
              <Tr key={`${group}-${key}`}>
                <Td className="text-ink-soft">{group}</Td>
                <Td className="font-mono text-[12px]">{key}</Td>
                <Td className="tabular-nums">{fmtWeight(v)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
        <Panel title="취향 입력 — 주제별 신호 수와 계산된 주제 가중치" flush>
          <Table head={["주제", "신호", "합계", "주제 가중치"]} empty="취향 계산에 들어간 신호가 없다">
            {ex.preference.signal_counts_by_topic.map((t) => (
              <Tr key={t.topic_id}>
                <Td className="font-medium">{t.name ?? shortId(t.topic_id)}</Td>
                <Td className="text-ink-soft">{fmtCounts(t.counts, SIGNAL_ACTION_LABEL)}</Td>
                <Td className="tabular-nums">{t.total}</Td>
                <Td className="tabular-nums">{fmtScore(ex.preference.topic_weights.find((w) => w.key === t.topic_id)?.weight ?? null)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>

      {ex.auto_expand && ex.auto_expand.candidates.length > 0 && (
        <Panel title="자동 확장 후보 — 관심 밖인데 트리거를 넘긴 주제 (강한 순)" flush>
          <Table head={["주제", "완청", "가중치"]}>
            {ex.auto_expand.candidates.map((c) => (
              <Tr key={c.topic_id}>
                <Td className="font-medium">{c.name ?? shortId(c.topic_id)}</Td>
                <Td className="tabular-nums">{c.completes}편</Td>
                <Td className="tabular-nums">{fmtScore(c.weight)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      )}

      {ex.regular ? (
        <SlotPanel
          title="정규 편성"
          slot={ex.regular}
          axisWeights={ex.weights.axes}
          extra={
            <>
              <li>시리즈 순서 게이트에서 빠진 편 {ex.regular.series.gated_out.length}편{ex.regular.series.gated_out.length > 0 && ` — ${ex.regular.series.gated_out.map((g) => g.title).join(", ")}`} · 후보 중 시리즈 연속 편 {ex.regular.series.continuation_count}편</li>
            </>
          }
          showContribution
        />
      ) : <p className="text-[13px] text-ink-soft">정규 편수가 0이라 정규 편성 계산이 없다.</p>}

      {ex.discovery ? (
        <SlotPanel
          title="탐험 편성 (새 주제)"
          slot={ex.discovery}
          axisWeights={ex.weights.axes}
          extra={<li>품질 하한 {fmtScore(ex.discovery.quality_floor)} (전형 완청률 {fmtPct(ex.discovery.typical_complete_rate, 0)} 기준)</li>}
        />
      ) : <p className="text-[13px] text-ink-soft">탐험 편수가 0이라 탐험 편성 계산이 없다.</p>}
      {ex.discovery_error && <p className="text-[13px] text-rose-700">탐험 계산 실패: {ex.discovery_error}</p>}

      <Panel title="오늘 이미 편성된 편 (실제 배치)">
        <p className="text-[13px] text-ink">{ex.today_placed.length === 0 ? "없음" : ex.today_placed.map((t) => t.title).join(" · ")}</p>
      </Panel>
    </div>
  );
}

type Slot = NonNullable<EarInspectorDetail["explanation"]["regular"]> | NonNullable<EarInspectorDetail["explanation"]["discovery"]>;

function SlotPanel({ title, slot, axisWeights, extra, showContribution = false }: {
  title: string; slot: Slot; axisWeights: Record<"embedding" | "signal" | "meta", number>; extra?: React.ReactNode; showContribution?: boolean;
}) {
  return (
    <Panel title={`${title} — 후보 ${slot.candidate_count}편 중 상위 ${slot.top.length}`} flush>
      <div className="space-y-1 border-b border-line px-4 py-3 text-xs text-ink-soft">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>SQL 필터: {slot.sql_filters.join(" → ")} → 풀 {slot.pool_size}편</li>
          <li>그 뒤 제외: {fmtCounts(slot.excluded_counts, EXCLUDED_REASON_LABEL)}</li>
          {extra}
          <li>편성될 편: {slot.picks.length === 0 ? "없음" : slot.picks.map((pk) => pickLabel(pk)).join(" · ")}</li>
        </ul>
      </div>
      <Table head={["순위", "콘텐츠", "주제", "최종 점수", ...(["embedding", "signal", "meta"] as const).map((a) => `${AXIS_LABEL[a]}${showContribution ? " (점수 × 실효 가중치)" : ""}`), "메타 항목", "편성"]} empty="후보가 없다(고갈)">
        {slot.top.map((c) => <CandidateRow key={c.content_id} c={c} axisWeights={axisWeights} showContribution={showContribution} />)}
      </Table>
    </Panel>
  );
}

function pickLabel(pk: EarInspectorPick): string {
  const tags = [pk.is_series_continuation ? "시리즈 연속" : null, pk.is_outside_interests ? "관심 밖" : null].filter(Boolean).join(", ");
  return `${pk.pick_order}. ${pk.title} (점수 ${pk.rank}위${tags ? ` · ${tags}` : ""})`;
}

function CandidateRow({ c, axisWeights, showContribution }: { c: EarInspectorCandidate; axisWeights: Record<"embedding" | "signal" | "meta", number>; showContribution: boolean }) {
  const axes = axisContributions({ embedding: c.breakdown.embedding, signal: c.breakdown.signal, meta: c.breakdown.meta }, axisWeights);
  const meta = Object.entries(c.breakdown.meta_items).filter(([, v]) => v != null).map(([k, v]) => `${k} ${fmtScore(v)}`).join(" · ");
  return (
    <Tr>
      <Td className="tabular-nums text-ink-soft">{c.rank}</Td>
      <Td className="max-w-[260px]">
        <div className="truncate font-medium">{c.title}</div>
        <div className="text-[11px] text-ink-soft">
          재생 {c.play_count} · 완청 {c.complete_count}{c.has_embedding ? "" : " · 임베딩 없음"}{c.is_series_continuation ? " · 시리즈 연속" : ""}
          {c.exposure_count != null ? ` · 노출 ${c.exposure_count}` : ""}{c.is_outside_interests ? " · 관심 밖" : ""}
        </div>
      </Td>
      <Td className="text-ink-soft">{c.topics.map((t) => t.name).join(", ") || "-"}</Td>
      <Td className="tabular-nums font-semibold">{fmtScore(c.score)}</Td>
      {axes.map((a) => (
        <Td key={a.axis} className="whitespace-nowrap tabular-nums">
          {fmtScore(a.score)}
          {showContribution && a.score != null && <span className="text-ink-soft"> × {fmtWeight(a.effectiveWeight)} = {fmtScore(a.contribution)}</span>}
        </Td>
      ))}
      <Td className="max-w-[260px] text-[11px] text-ink-soft">{meta || "-"}</Td>
      <Td>{c.would_place ? <span className="font-semibold text-brand-ink">{c.pick_order}번째</span> : <span className="text-ink-soft">-</span>}</Td>
    </Tr>
  );
}

function PrivacyNote() {
  return (
    <ul className="list-disc space-y-0.5 rounded border border-line bg-[#f7f9fb] py-2 pl-7 pr-3 text-xs text-ink-soft">
      <li>이름·이메일은 서버가 조회하지도 싣지도 않는다 — 사용자는 <code>user_id</code> 앞 8자다. 처리 목적 &quot;콘텐츠 편성과 추천 · 서비스 개선&quot; 안에서만 본다. 화면의 값을 Slack·티켓·문서에 옮겨 적지 않는다.</li>
      <li>사용자를 눌러 상세를 열 때마다 서버가 감사 로그(<code>insights.recommendation_view</code>)를 남긴다. 목록만 보는 것은 남지 않는다.</li>
      <li>읽기 전용이다 — 상세를 열어도 관심 주제·취향 캐시·라이브러리·편성 기록 어느 것도 바뀌지 않는다.</li>
    </ul>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{children}</h2>;
}
