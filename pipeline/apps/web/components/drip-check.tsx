"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Badge, Panel, Table, Td, Tr, btnCls } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { EarApiError, type EarDripCandidate, type EarDripPreview, getEarDripPreview } from "@/lib/ear";
import { earErrMsg } from "@/app/publish/ear-connect";

/**
 * 편성 미리보기 화면 — 서버 응답을 해석 없이 그대로 펼친다. 점수는 서버가 준 값이고 여기서 다시 계산하는 것은
 * 없다(판정은 서버가 한다). **자동 폴링하지 않는다** — 열 때 1회 + [새로고침]. 한 번의 계산이 후보 300건 × 2를
 * 스코어링하는 조회라, 보고만 있어도 제품 서버를 두드리게 두지 않는다.
 *
 * 화면은 ① 개요 → ② 입력 → ③ 계산식 → ④ 결과의 네 단계로 읽는다(사용자 요청 2026-09-18). 2026-09-19 다듬기:
 * 세 축(임베딩·신호·메타)에 색을 하나씩 정해 계산식·편성분 카드·후보 표에서 같은 색으로 보이게 했고, 숫자만
 * 늘어놓던 자리에 막대(구성·가중치·재고)를 붙였다. 정보는 빼지 않았다 — 긴 표는 상위 40편만 먼저 보이고
 * [전부 보기]로 편다.
 */

const SKIP_LABEL: Record<NonNullable<EarDripPreview["skip_reason"]>, string> = {
  no_interests: "관심 주제 0개 — 편성 스킵",
  unfinished_inventory: "미청취 재고 초과 — 편성 스킵",
  plan_disabled: "플랜 편수 0 — 편성 스킵",
};
const ACTION_LABEL: Record<string, string> = {
  play: "재생", complete: "완청", replay: "재청취", save: "담기", unsave: "담기 해제", delete: "삭제",
};
const ACTION_ORDER = ["complete", "replay", "save", "play", "unsave", "delete"];
const ACTION_TONE: Record<string, string> = { complete: "done", replay: "done", save: "approved", play: "held", unsave: "failed", delete: "failed" };
const EXCLUDE_LABEL: Record<string, string> = {
  episode_order: "시리즈 순서 — 직전 편 미완청",
  user_removed_topic: "사용자가 직접 해제한 주제",
  below_quality_floor: "품질 하한 미달(스무딩 완청률)",
};

/** 세 축의 색 — 계산식·편성분 카드·후보 표가 같은 색을 쓴다. 탐험의 세 항목도 같은 순서로 같은 색을 쓴다 */
const AXIS_COLOR = { embedding: "#7c6cf0", signal: "#3b9ee0", meta: "#16a394" } as const;
const AXIS_LABEL = { embedding: "임베딩", signal: "신호", meta: "메타" } as const;
const DISCOVERY_COLOR = { low_exposure: AXIS_COLOR.embedding, freshness: AXIS_COLOR.signal, quality: AXIS_COLOR.meta } as const;
const DISCOVERY_LABEL = { low_exposure: "저노출", freshness: "신선도", quality: "품질" } as const;

/** 메타 항목의 뜻 — 계산식 표와 후보 표 머리(툴팁)가 같은 문장을 쓴다 */
const META_ROWS: [keyof EarDripCandidate["breakdown"]["meta_items"], string, string][] = [
  ["topic_match", "주제일치", "관심 주제와 겹치는 수 — 1개 0.6, 2개 0.8, 3개 이상 1"],
  ["freshness", "신선도", "발행 후 경과일에 반감기 적용 — 시의성 30일, 미지정 90일, 에버그린은 항상 1"],
  ["popularity", "인기도", "0.7×스무딩 완청률(재생 20회 미만은 풀 평균으로 끌어당김) + 0.3×재생 수 로그"],
  ["difficulty_fit", "난이도", "완청 이력의 난이도 분포와 대조. 콜드스타트는 beginner 1 · intermediate 0.5 · advanced 0.2"],
  ["career_fit", "커리어", "직군·연차 vs 콘텐츠 청자 세트 — 정확 1 · 이웃 연차 0.6 · 직군만 0.3 · 불일치 0"],
  ["series_continuity", "시리즈", "완청한 시리즈의 바로 다음 편이면 1(강한 가점), 아니면 항목 자체가 빠진다"],
  ["exposure_fatigue", "노출피로", "1 − (최근 14일 편성 주제와 겹치는 비율) — 같은 주제만 계속 가는 것을 막는다"],
];
const SIGNAL_ROWS: [keyof NonNullable<EarDripCandidate["breakdown"]["signal_items"]>, string][] = [
  ["topic_preference", "주제"], ["author_preference", "저자"], ["keyword_match", "키워드"], ["format_preference", "형식"], ["duration_closeness", "길이"],
];
const DISCOVERY_ROWS: [keyof typeof DISCOVERY_LABEL, string][] = [
  ["low_exposure", "1 / (1 + 전 사용자 편성 이력 수) — 아무에게도 안 간 편이 1"],
  ["freshness", "정규와 같은 반감기 규칙"],
  ["quality", "스무딩 완청률 — 재생 5회 미만은 판정 면제"],
];

/** 후보 표가 처음에 보여 주는 행 수 — 그 아래는 [전부 보기]. 300행을 한 번에 그리면 읽을 수 없다 */
const TABLE_PREVIEW_ROWS = 40;

const f2 = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(2));
const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const min = (sec: number) => `${Math.round(sec / 60)}분`;
const topicNames = (topics: { topic_id: string; name: string | null }[]) => topics.map((t) => t.name ?? t.topic_id.slice(0, 8)).join(" · ") || "주제 없음";

type Part = { key: string; label: string; color: string; value: number; raw: number; weight: number };

/**
 * 점수의 구성 — `가중치 × 축 점수`를 축별로 나눈 것. null 축은 서버가 빼고 나머지 가중치를 다시 정규화하므로
 * 여기서도 있는 축의 가중치 합으로 나눈다. 합이 곧 서버가 준 점수다(표시용 분해이지 재계산이 아니다).
 */
function regularParts(c: EarDripCandidate, axes: EarDripPreview["weights"]["axes"]): Part[] {
  const present = (["embedding", "signal", "meta"] as const).filter((k) => c.breakdown[k] != null);
  const wsum = present.reduce((s, k) => s + axes[k], 0) || 1;
  return present.map((k) => ({ key: k, label: AXIS_LABEL[k], color: AXIS_COLOR[k], raw: c.breakdown[k]!, weight: axes[k], value: (axes[k] * c.breakdown[k]!) / wsum }));
}
function discoveryParts(c: EarDripCandidate, items: Record<string, number>): Part[] {
  const m = c.breakdown.meta_items;
  const raw = { low_exposure: m.exposure_fatigue, freshness: m.freshness, quality: m.popularity };
  const present = (["low_exposure", "freshness", "quality"] as const).filter((k) => raw[k] != null);
  const wsum = present.reduce((s, k) => s + (items[k] ?? 0), 0) || 1;
  return present.map((k) => ({ key: k, label: DISCOVERY_LABEL[k], color: DISCOVERY_COLOR[k], raw: raw[k]!, weight: items[k] ?? 0, value: ((items[k] ?? 0) * raw[k]!) / wsum }));
}

export function DripCheck({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [data, setData] = useState<EarDripPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setErr(null);
    try {
      setData(await getEarDripPreview(target.trim()));
    } catch (e) {
      if (e instanceof EarApiError && e.status === 404) setErr(e.errorCode === "NOT_FOUND" ? `${target} 사용자를 찾을 수 없어요` : "제품 서버에 편성 미리보기가 아직 배포되지 않았어요 (404)");
      else setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 마운트 직후 1회 — 효과 안에서 바로 setState 하지 않도록 한 틱 미룬다
    const timer = setTimeout(() => void load(defaultEmail), 0);
    return () => clearTimeout(timer);
  }, [load, defaultEmail]);

  return (
    <div className="space-y-5">
      <div className="sticky top-14 z-[5] -mx-6 border-b border-line bg-[#eef1f5]/95 px-6 py-2 backdrop-blur">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); void load(email); }}
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="w-64 rounded border border-line bg-panel px-2.5 py-1.5 text-[13px] text-ink"
            placeholder="대상 사용자 이메일"
          />
          <button type="submit" className={btnCls("primary")} disabled={loading}>
            {loading ? "계산 중…" : "새로고침"}
          </button>
          {data && (
            <span className="text-xs text-ink-soft">
              서비스 날짜 <strong className="text-ink">{data.service_date}</strong> · 계산 {fmtTime(data.computed_at)} · 매번 서버에서 다시 계산
            </span>
          )}
          <nav className="ml-auto flex items-center gap-1">
            {[["개요", "분석 전 확인"], ["입력", "관심·신호·취향"], ["계산", "점수식"], ["결과", "후보·편성"]].map(([t, s], i) => (
              <a key={t} href={`#step-${i + 1}`} className="inline-flex items-center gap-1.5 rounded border border-line bg-panel px-2 py-1 text-xs text-ink hover:bg-[#f7f9fb]" title={s}>
                <span className="grid h-4 w-4 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white">{i + 1}</span>
                {t}
              </a>
            ))}
          </nav>
        </form>
      </div>

      {err && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{err}</div>}
      {!data && !err && <p className="text-[13px] text-ink-soft">계산 중…</p>}
      {data && <Preview data={data} />}
    </div>
  );
}

export function Preview({ data }: { data: EarDripPreview }) {
  const regularPicks = (data.regular?.candidates ?? []).filter((c) => c.pick_order !== null).sort((a, b) => a.pick_order! - b.pick_order!);
  const discoveryPicks = (data.discovery?.candidates ?? []).filter((c) => c.pick_order !== null).sort((a, b) => a.pick_order! - b.pick_order!);
  const pref = data.preference;
  const coldStart = pref.is_cold_start === true;
  const w = data.weights;
  const metaW = coldStart ? w.meta_items_cold_start : w.meta_items;
  const skipped = data.skip_reason !== null;
  const unfinished = data.unfinished_count ?? 0;
  const completes = pref.complete_signal_count ?? 0;

  const actionCounts = ACTION_ORDER.map((a) => [a, data.signals.filter((s) => s.action === a).length] as const).filter(([, n]) => n > 0);

  return (
    <>
      {/* ── 1. 개요 ─────────────────────────────────────────── */}
      <Section
        no={1}
        title="개요 — 분석 전 확인"
        desc="계산에 들어가기 전에 이 사용자가 오늘 배치 대상인지, 어떤 조건에서 계산되는지 본다. 스킵이면 아래 편성분은 실제로는 가지 않는다."
      >
        <div className={`rounded-md border px-4 py-3 shadow-[0_1px_2px_rgba(38,49,61,0.04)] ${skipped ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50/60"}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className={`text-lg font-semibold ${skipped ? "text-amber-800" : "text-brand-ink"}`}>{skipped ? "스킵" : "편성"}</span>
            <span className="text-[13px] text-ink">
              {skipped ? (
                <><strong>{SKIP_LABEL[data.skip_reason!]}</strong> — 아래 계산은 스킵이 아니었다면 갔을 편이다.</>
              ) : (
                <>이대로면 다음 배치에서 정규 <strong>{regularPicks.length}편</strong> · 새 주제 <strong>{discoveryPicks.length}편</strong>이 적립된다 (플랜 {data.drip_count ?? 0}+{data.discovery_count ?? 0}).</>
              )}
            </span>
            {data.discovery_error && <span className="text-xs text-rose-700">탐험 계산 실패: {data.discovery_error}</span>}
          </div>
          {(regularPicks.length > 0 || discoveryPicks.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {regularPicks.map((c) => <PickChip key={c.content_id} order={c.pick_order!} kind="regular" title={c.title} score={c.score} />)}
              {discoveryPicks.map((c) => <PickChip key={c.content_id} order={c.pick_order!} kind="discovery" title={c.title} score={c.score} />)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="사용자" value={data.user.nickname ?? "(닉네임 없음)"} sub={`${data.user.email ?? "-"} · ${data.user.tier}${data.user.job_category ? ` · ${data.user.job_category}` : ""}${data.user.years_of_experience != null ? ` ${data.user.years_of_experience}년+` : ""}${data.user.onboarding_completed ? "" : " · 온보딩 미완"}`} />
          <Tile
            label="미청취 재고"
            value={`${data.unfinished_count ?? "–"} / ${data.unfinished_limit}`}
            tone={unfinished >= data.unfinished_limit ? "text-amber-700" : undefined}
            bar={{ ratio: unfinished / data.unfinished_limit, color: unfinished >= data.unfinished_limit ? "#d97706" : AXIS_COLOR.meta }}
            sub={`라이브러리의 미재생 + 진행 중. ${data.unfinished_limit}편 이상이면 그날 편성을 건너뛴다`}
          />
          <Tile
            label="취향 상태"
            value={coldStart ? "콜드스타트" : "개인화"}
            tone={coldStart ? "text-amber-700" : undefined}
            bar={{ ratio: completes / pref.cold_start_threshold, color: coldStart ? "#d97706" : AXIS_COLOR.meta }}
            sub={`완청 ${pref.complete_signal_count ?? "–"}건 / 기준 ${pref.cold_start_threshold}건 · 취향 임베딩 ${pref.has_taste_embedding ? "있음" : "없음"}`}
          />
          <Tile
            label="후보 풀"
            value={<>정규 {data.regular?.candidates.length ?? 0} · 탐험 {data.discovery?.candidates.length ?? 0}</>}
            sub={`정규 풀 ${data.regular?.pool_size ?? 0}편 중 시리즈 게이트 제외 ${data.regular?.gated_out.length ?? 0} · 탐험 풀 ${data.discovery?.pool_size ?? 0}편 중 제외 ${data.discovery?.excluded.length ?? 0}`}
          />
        </div>

        <Panel title="오늘 실제 적립된 편성분" right={<span className="text-xs text-ink-soft">서비스 날짜 {data.service_date} · 04시 경계</span>}>
          {data.today_placed.length === 0 ? (
            <p className="text-[13px] text-ink-soft">오늘 배치가 적립한 편이 없다 — 05:00 배치 전이거나 스킵·고갈.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-[13px]">
              {data.today_placed.map((c) => <li key={c.content_id} className="rounded border border-line bg-[#f7f9fb] px-2.5 py-1">{c.title}</li>)}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-soft">이미 적립된 편은 후보에서 빠진다(라이브러리·제외 기록). 그래서 이 화면은 항상 다음 배치의 답이다.</p>
        </Panel>
      </Section>

      {/* ── 2. 입력 ─────────────────────────────────────────── */}
      <Section
        no={2}
        title="입력 — 관심 주제·신호·취향"
        desc="스코어링이 읽는 사용자 쪽 입력이다. 관심 주제는 후보 풀을 가르고, 최근 신호가 취향 벡터를 만든다. 폰에서 완청·담기·해제를 하면 여기부터 바뀐다."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="관심 주제 — 정규 후보의 범위">
            <ChipGroup
              label={`활성 ${data.interests.length}개`}
              empty="활성 관심 주제가 없다"
              chips={data.interests.map((t) => ({ key: t.topic_id, text: t.name ?? t.topic_id.slice(0, 8), hint: t.source }))}
              tone="border-brand/40 bg-emerald-50/60 text-ink"
            />
            <ChipGroup
              label="직접 해제 — 탐험에서도 제외"
              empty="없음"
              chips={data.removed_topics.map((t) => ({ key: t.topic_id, text: t.name ?? t.topic_id.slice(0, 8) }))}
              tone="border-rose-200 bg-rose-50 text-rose-700 line-through decoration-rose-300"
            />
            <ChipGroup
              label="최근 14일 편성 주제 — 노출 피로 감점"
              empty="없음"
              chips={(data.regular?.recent_drip_topics ?? []).map((t) => ({ key: t.topic_id, text: t.name ?? t.topic_id.slice(0, 8) }))}
              tone="border-amber-200 bg-amber-50 text-amber-800"
            />
            <p className="mt-3 border-t border-line pt-2 text-xs text-ink-soft">정규 후보는 활성 주제 중 하나라도 달린 발행 콘텐츠만. 탐험 후보는 주제 제한 없이 시리즈 1편·단편만.</p>
          </Panel>

          <Panel
            title={`최근 신호 ${data.signals.length}건 — 취향 벡터의 재료`}
            flush
            className="lg:col-span-2"
            right={
              <span className="flex flex-wrap gap-1">
                {actionCounts.map(([a, n]) => <Badge key={a} tone={ACTION_TONE[a]}>{ACTION_LABEL[a] ?? a} {n}</Badge>)}
              </span>
            }
          >
            <div className="max-h-72 overflow-y-auto">
              <Table head={["시각", "행동", "콘텐츠"]} empty="신호가 없다 — 재생·완청·담기를 하면 여기 쌓인다">
                {data.signals.slice(0, 200).map((s, i) => (
                  <Tr key={`${s.content_id}-${s.created_at}-${i}`}>
                    <Td className="whitespace-nowrap text-ink-soft">{fmtTime(s.created_at)}</Td>
                    <Td><Badge tone={ACTION_TONE[s.action] ?? "held"}>{ACTION_LABEL[s.action] ?? s.action}</Badge></Td>
                    <Td className="max-w-[28rem] truncate">{s.title ?? s.content_id}</Td>
                  </Tr>
                ))}
              </Table>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-ink-soft">
              <span>기간 90일 · 최대 500건</span>
              <span>완청·재청취 <b className="text-ink">+1</b> · 담기 <b className="text-ink">+0.5</b> · 재생 <b className="text-ink">0</b> · 담기 해제·삭제 <b className="text-rose-700">−0.6</b></span>
              <span>14일마다 절반으로 감쇠</span>
              <span>완청 {pref.cold_start_threshold}건 미만이면 콜드스타트</span>
            </div>
          </Panel>
        </div>

        <Panel
          title="취향 벡터 — 신호를 합산한 결과"
          right={<span className="text-xs text-ink-soft">지금 계산한 값 · 저장하지 않음 · 절댓값 큰 순 15개</span>}
        >
          {coldStart && (
            <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              콜드스타트라 임베딩·신호 축은 편성 점수에서 빠진다. 아래 값은 참고용이고, 완청이 {pref.cold_start_threshold}건이 되면 점수에 들어간다.
            </p>
          )}
          <div className="grid gap-x-6 gap-y-2 lg:grid-cols-2">
            <WeightList title="주제 — 신호가 쌓인 주제일수록 +, 해제·삭제한 주제는 −" items={pref.topic_weights} />
            <WeightList title="키워드" items={pref.keyword_weights} />
            <WeightList title="형식" items={pref.format_weights} />
            <WeightList title="저자" items={pref.author_weights} />
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line pt-3 text-xs">
            <dt className="text-ink-soft">선호 길이</dt>
            <dd>{pref.duration_pref ? <>중앙 <b>{min(pref.duration_pref.median_sec)}</b> (p25 {min(pref.duration_pref.p25_sec)} · p75 {min(pref.duration_pref.p75_sec)})</> : "완청·재청취 이력 없음"}</dd>
            <dt className="text-ink-soft">난이도 분포</dt>
            <dd>{pref.difficulty_affinity ? Object.entries(pref.difficulty_affinity).map(([k, v]) => `${k} ${pct(v)}`).join(" · ") : "완청 이력에 난이도 정보 없음"}</dd>
            <dt className="text-ink-soft">취향 임베딩</dt>
            <dd>{pref.has_taste_embedding ? "있음 — 완청·담기한 콘텐츠 임베딩의 가중 평균" : "없음 — 긍정 신호 콘텐츠에 임베딩이 없거나 신호 없음"}</dd>
          </dl>
        </Panel>
      </Section>

      {/* ── 3. 계산 ─────────────────────────────────────────── */}
      <Section
        no={3}
        title="계산 — 점수는 이렇게 나온다"
        desc="후보마다 아래 식으로 점수를 내고, 점수 순서에 다양성 제약을 얹어 뽑는다. 4단계 표의 열이 이 식의 항목이고 색도 같다. –(null)은 입력이 없어 그 항목을 빼고 나머지 가중치를 다시 정규화했다는 뜻이다."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="정규 편성 점수 — 3축" right={coldStart ? <Badge tone="queued">콜드스타트 가중치</Badge> : undefined}>
            <FormulaLine
              terms={(["embedding", "signal", "meta"] as const).map((k) => ({ weight: w.axes[k], label: AXIS_LABEL[k], color: AXIS_COLOR[k], muted: coldStart && k !== "meta" }))}
            />
            <WeightTable
              rows={[
                { color: AXIS_COLOR.embedding, name: "임베딩", weight: w.axes.embedding, muted: coldStart, desc: "취향 임베딩과 콘텐츠 임베딩의 코사인 유사도를 0~1로. 콜드스타트·임베딩 없음이면 빠진다" },
                { color: AXIS_COLOR.signal, name: "신호", weight: w.axes.signal, muted: coldStart, desc: `취향 벡터 대조 — ${SIGNAL_ROWS.map(([k, l]) => `${l} ${w.signal_items[k] ?? "–"}`).join(" · ")}. 콜드스타트면 빠진다` },
                { color: AXIS_COLOR.meta, name: "메타", weight: w.axes.meta, desc: "콘텐츠 자체의 규칙 — 아래 7항목의 가중합" },
                ...META_ROWS.map(([k, name, desc]) => ({ color: AXIS_COLOR.meta, name, weight: metaW[k], desc, indent: true })),
              ]}
            />
            {coldStart && <p className="mt-2 text-xs text-amber-700">콜드스타트라 임베딩·신호 축이 빠지고 메타 축만으로 점수를 낸다(가중치는 신선도·인기도를 키운 값). 완청이 기준에 닿아 개인화로 넘어가면 세 축이 다 들어가고 표의 가중치도 바뀐다.</p>}
          </Panel>

          <Panel title="탐험(새 주제) 점수와 선정 순서">
            <FormulaLine
              terms={(["low_exposure", "freshness", "quality"] as const).map((k) => ({ weight: w.discovery_items[k] ?? 0, label: DISCOVERY_LABEL[k], color: DISCOVERY_COLOR[k] }))}
            />
            <WeightTable rows={DISCOVERY_ROWS.map(([k, desc]) => ({ color: DISCOVERY_COLOR[k], name: DISCOVERY_LABEL[k], weight: w.discovery_items[k] ?? 0, desc }))} />
            <div className="mt-3 text-xs">
              <div className="mb-1 font-semibold text-ink-soft">선정 순서</div>
              <ol className="list-decimal space-y-1 pl-5 text-ink">
                <li>사용자가 직접 해제한 주제의 편 제외</li>
                <li>스무딩 완청률이 품질 하한{data.discovery ? <b> {pct(data.discovery.quality_floor)}</b> : ""} 미만이면 제외 — 하한 = min(20%, 풀 전형 완청률{data.discovery ? ` ${pct(data.discovery.typical_complete_rate)}` : ""}의 절반)</li>
                <li><strong>관심 밖 주제(새 주제) 풀 먼저</strong>, 없으면 관심 안 저노출도 허용</li>
                <li>각 풀 안에서 정규 편성분과 주제가 겹치지 않는 편 먼저</li>
                <li>그다음 MMR 재계산 최고점 — 정규 편과 내용이 비슷하면 감점</li>
              </ol>
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 text-xs lg:grid-cols-2">
          <Note title="정규 선정 — 다양성 제약">
            점수순으로 뽑되 이미 뽑은 편과 임베딩이 비슷하면 λ 0.3만큼 감점(MMR), 임베딩이 없으면 같은 주제·저자를 피한다. 시리즈 다음 편은 예외. 그래서 표의 순위와 편성 순서가 다를 수 있다.
          </Note>
          <Note title="후보에서 미리 빠지는 것">
            라이브러리에 있거나 제외 기록(재생·삭제·담기 해제·과거 편성)이 있는 편, 직전 편을 완청하지 않은 시리즈 중간 편, 라이선스 만료·회수된 편.
          </Note>
        </div>
      </Section>

      {/* ── 4. 결과 ─────────────────────────────────────────── */}
      <Section
        no={4}
        title="결과 — 최종 편성과 후보 전체 점수"
        desc="3단계 식을 후보 전부에 적용한 결과다. 막대는 점수의 구성(가중치 × 축 점수)이고 색은 3단계와 같다. 초록 행이 최종 편성분이고 숫자는 편성 순서. 순위와 편성 순서가 다르면 다양성 제약이 작용한 것이다."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title={`정규 편성 ${regularPicks.length}편 — 관심 주제 안에서`} className="lg:col-span-2">
            <PickList picks={regularPicks} empty="정규 후보가 없다 — 고갈(exhausted). 관심 주제에 안 본 콘텐츠가 더 없다" kind="regular" weights={w} />
          </Panel>
          <Panel title={`새 주제 ${discoveryPicks.length}편 — 관심 밖 우선`}>
            <PickList picks={discoveryPicks} empty="탐험 후보가 없다" kind="discovery" weights={w} />
          </Panel>
        </div>

        {data.regular && (
          <Panel
            title={`정규 후보 ${data.regular.candidates.length}편 — 점수 내림차순`}
            right={<span className="text-xs text-ink-soft">풀 {data.regular.pool_size}편 중 시리즈 게이트 제외 {data.regular.gated_out.length}편 · 신호 열에 마우스를 올리면 항목별 점수</span>}
            flush
          >
            <CandidateTable candidates={data.regular.candidates} kind="regular" weights={w} metaW={metaW} />
            {data.regular.gated_out.length > 0 && <ExcludedList title="시리즈 순서 게이트에서 빠진 편" items={data.regular.gated_out} />}
          </Panel>
        )}

        {data.discovery && (
          <Panel
            title={`탐험 후보 ${data.discovery.candidates.length}편 — 관심 밖(새 주제) 우선`}
            right={<span className="text-xs text-ink-soft">품질 하한 {pct(data.discovery.quality_floor)} · 풀 전형 완청률 {pct(data.discovery.typical_complete_rate)}</span>}
            flush
          >
            <CandidateTable candidates={data.discovery.candidates} kind="discovery" weights={w} metaW={metaW} />
            {data.discovery.excluded.length > 0 && <ExcludedList title="선정 전에 빠진 편" items={data.discovery.excluded} />}
          </Panel>
        )}
      </Section>
    </>
  );
}

/** 단계 머리 — 번호·제목·이 단계에서 무엇을 보는지 한 줄. `id`는 상단 단계 내비의 앵커 */
function Section({ no, title, desc, children }: { no: number; title: string; desc: string; children: ReactNode }) {
  return (
    <section id={`step-${no}`} className="scroll-mt-28 space-y-3">
      <div className="flex items-start gap-3 border-b border-line pb-2 pt-1">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{no}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 max-w-4xl text-xs text-ink-soft">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** 개요 타일 — 값 + (선택) 비율 막대. 재고·콜드스타트처럼 문턱이 있는 값은 막대가 문턱까지의 거리를 보여 준다 */
function Tile({ label, value, sub, tone, bar }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; bar?: { ratio: number; color: string } }) {
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3 shadow-[0_1px_2px_rgba(38,49,61,0.04)]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold tabular-nums ${tone ?? "text-ink"}`}>{value}</div>
      {bar && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[#eef1f4]">
          <div className="h-full rounded" style={{ width: `${Math.min(100, Math.max(0, bar.ratio * 100))}%`, background: bar.color }} />
        </div>
      )}
      {sub && <div className="mt-1 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

function PickChip({ order, kind, title, score }: { order: number; kind: "regular" | "discovery"; title: string; score: number }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded border border-line bg-panel px-2 py-1 text-[13px]">
      <OrderBadge order={order} kind={kind} />
      <span className="truncate">{title}</span>
      <span className="shrink-0 text-xs tabular-nums text-ink-soft">{f2(score)}</span>
    </span>
  );
}

/** 편성 순서 배지 — 정규는 brand, 새 주제는 보라. 개요·편성분 카드·후보 표가 같은 배지를 쓴다 */
function OrderBadge({ order, kind }: { order: number; kind: "regular" | "discovery" }) {
  return (
    <span
      className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 text-[11px] font-semibold text-white"
      style={{ background: kind === "regular" ? AXIS_COLOR.meta : AXIS_COLOR.embedding }}
      title={kind === "regular" ? `정규 ${order}번째` : "새 주제"}
    >
      {kind === "regular" ? order : "새"}
    </span>
  );
}

function ChipGroup({ label, chips, empty, tone }: { label: string; chips: { key: string; text: string; hint?: string }[]; empty: string; tone: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 text-[11px] font-semibold text-ink-soft">{label}</div>
      {chips.length === 0 ? (
        <span className="text-xs text-ink-soft">{empty}</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.key} className={`rounded-full border px-2.5 py-0.5 text-xs ${tone}`} title={c.hint}>
              {c.text}{c.hint && <span className="ml-1 opacity-60">· {c.hint}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 계산식 한 줄 — `점수 = w×축 + w×축 + …`를 축 색 칩으로 */
function FormulaLine({ terms }: { terms: { weight: number; label: string; color: string; muted?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded bg-[#f7f9fb] px-3 py-2 text-[13px]">
      <span className="font-semibold text-ink">점수 =</span>
      {terms.map((t, i) => (
        <Fragment key={t.label}>
          {i > 0 && <span className="text-ink-soft">+</span>}
          <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 tabular-nums ${t.muted ? "opacity-40" : ""}`} style={{ borderColor: t.color, color: t.color, borderStyle: t.muted ? "dashed" : "solid" }} title={t.muted ? "콜드스타트라 이 축은 빠진다" : undefined}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
            <b>{t.weight}</b> × {t.label}{t.muted ? " (빠짐)" : ""}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/** 항목 · 가중치(막대) · 뜻 — 가중치와 설명을 한 줄에 두어 "이 항목이 얼마나 미는가"를 바로 읽게 한다 */
function WeightTable({ rows }: { rows: { color: string; name: string; weight: number; desc: string; indent?: boolean; muted?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => r.weight), 0.0001);
  return (
    <table className="mt-3 w-full text-xs">
      <tbody className="divide-y divide-line/60">
        {rows.map((r) => (
          <tr key={r.name} className={r.muted ? "opacity-40" : ""}>
            <td className={`w-[6.5rem] whitespace-nowrap py-1.5 pr-2 align-top font-semibold text-ink ${r.indent ? "pl-4" : ""}`}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: r.color, opacity: r.indent ? 0.5 : 1 }} />
              {r.name}
            </td>
            <td className="w-[6.5rem] whitespace-nowrap py-1.5 pr-3 align-top">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-12 overflow-hidden rounded bg-[#eef1f4]"><span className="block h-full rounded" style={{ width: `${(r.weight / max) * 100}%`, background: r.color, opacity: r.indent ? 0.6 : 1 }} /></span>
                <span className="w-8 tabular-nums">{r.weight}</span>
              </div>
            </td>
            <td className="py-1.5 align-top text-ink-soft">{r.desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      <p className="text-ink-soft">{children}</p>
    </div>
  );
}

/** 점수 구성 막대 — 축별 `가중치 × 축 점수`를 이어 붙인다. 전체 길이는 점수(0~1 척도) */
function PartsBar({ parts, score, height = "h-2" }: { parts: Part[]; score: number; height?: string }) {
  return (
    <div className={`flex ${height} w-full overflow-hidden rounded bg-[#eef1f4]`} title={parts.map((p) => `${p.label} ${p.weight}×${f2(p.raw)} = ${f2(p.value)}`).join(" · ") + ` = ${f2(score)}`}>
      {parts.map((p) => (
        <span key={p.key} className="h-full" style={{ width: `${Math.max(0, p.value) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

function PickList({ picks, empty, kind, weights }: { picks: EarDripCandidate[]; empty: string; kind: "regular" | "discovery"; weights: EarDripPreview["weights"] }) {
  if (picks.length === 0) return <p className="text-[13px] text-ink-soft">{empty}</p>;
  return (
    <ol className="space-y-2">
      {picks.map((c) => {
        const parts = kind === "regular" ? regularParts(c, weights.axes) : discoveryParts(c, weights.discovery_items);
        return (
          <li key={c.content_id} className="flex items-start gap-3 rounded border border-line bg-[#f7f9fb] px-3 py-2">
            <span className="mt-0.5"><OrderBadge order={c.pick_order!} kind={kind} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink" title={c.title}>{c.title}</div>
                <div className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{f2(c.score)}</div>
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-soft">
                {topicNames(c.topics)} · {min(c.duration_sec)}
                {c.author_name ? ` · ${c.author_name}` : ""}
                {c.is_series_continuation ? " · 시리즈 다음 편" : ""}
                {kind === "discovery" ? (c.is_outside_interests ? " · 관심 밖" : " · 관심 안(저노출)") : ""}
              </div>
              <div className="mt-1.5"><PartsBar parts={parts} score={c.score} /></div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-ink-soft">
                {parts.map((p) => (
                  <span key={p.key} className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                    {p.label} {f2(p.raw)} <span className="opacity-70">→ {f2(p.value)}</span>
                  </span>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 후보 표 — 머리 두 줄(축 그룹 · 항목), 점수 구성 막대, 값 크기에 따른 옅은 배경. 처음엔 상위 40행만 */
function CandidateTable({ candidates, kind, weights, metaW }: { candidates: EarDripCandidate[]; kind: "regular" | "discovery"; weights: EarDripPreview["weights"]; metaW: Record<string, number> }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? candidates : candidates.slice(0, TABLE_PREVIEW_ROWS);
  const hidden = candidates.length - rows.length;
  const th = "whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold text-ink-soft";
  const thNum = `${th} text-right`;
  const group = "border-b border-line px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-wide";

  return (
    <div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-[1] bg-[#f7f9fb]">
            <tr>
              <th className={group} colSpan={kind === "discovery" ? 4 : 3} />
              {kind === "regular" ? (
                <>
                  <th className={group} colSpan={3} style={{ color: AXIS_COLOR.signal }}>3축 (가중치 {weights.axes.embedding} · {weights.axes.signal} · {weights.axes.meta})</th>
                  <th className={group} colSpan={7} style={{ color: AXIS_COLOR.meta }}>메타 항목 (메타 축의 구성)</th>
                </>
              ) : (
                <th className={group} colSpan={4} style={{ color: AXIS_COLOR.meta }}>탐험 항목 (가중치 {weights.discovery_items.low_exposure} · {weights.discovery_items.freshness} · {weights.discovery_items.quality})</th>
              )}
              <th className={group} colSpan={2} />
            </tr>
            <tr className="border-b border-line">
              <th className={th}>#</th>
              <th className={th}>콘텐츠</th>
              {kind === "discovery" && <th className={th}>새 주제?</th>}
              <th className={`${th} min-w-[9rem]`}>점수 · 구성</th>
              {kind === "regular" ? (
                <>
                  <th className={thNum} style={{ color: AXIS_COLOR.embedding }}>임베딩</th>
                  <th className={thNum} style={{ color: AXIS_COLOR.signal }}>신호</th>
                  <th className={thNum} style={{ color: AXIS_COLOR.meta }}>메타</th>
                  {META_ROWS.map(([k, name, desc]) => <th key={k} className={thNum} title={`가중치 ${metaW[k]} — ${desc}`}>{name}<span className="ml-0.5 font-normal opacity-60">{metaW[k]}</span></th>)}
                </>
              ) : (
                <>
                  <th className={thNum} style={{ color: DISCOVERY_COLOR.low_exposure }}>저노출</th>
                  <th className={thNum} style={{ color: DISCOVERY_COLOR.freshness }}>신선도</th>
                  <th className={thNum} style={{ color: DISCOVERY_COLOR.quality }}>품질</th>
                  <th className={thNum} title="전 사용자 편성 이력 수">노출 수</th>
                </>
              )}
              <th className={thNum}>재생/완청</th>
              <th className={th}>발행</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={20} className="px-4 py-8 text-center text-ink-soft">후보가 없다</td></tr>}
            {rows.map((c, i) => <CandidateRow key={c.content_id} c={c} rank={i + 1} kind={kind} weights={weights} />)}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <div className="border-t border-line px-4 py-2 text-xs text-ink-soft">
          상위 {rows.length}편만 보인다 · <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => setShowAll(true)}>나머지 {hidden}편 전부 보기</button>
        </div>
      )}
      {showAll && candidates.length > TABLE_PREVIEW_ROWS && (
        <div className="border-t border-line px-4 py-2 text-xs text-ink-soft">
          <button type="button" className="font-semibold text-brand-ink hover:underline" onClick={() => setShowAll(false)}>상위 {TABLE_PREVIEW_ROWS}편만 보기</button>
        </div>
      )}
    </div>
  );
}

function CandidateRow({ c, rank, kind, weights }: { c: EarDripCandidate; rank: number; kind: "regular" | "discovery"; weights: EarDripPreview["weights"] }) {
  const picked = c.pick_order !== null;
  const m = c.breakdown.meta_items;
  const s = c.breakdown.signal_items;
  const parts = kind === "regular" ? regularParts(c, weights.axes) : discoveryParts(c, weights.discovery_items);
  const signalTitle = s
    ? `신호 항목 — ${SIGNAL_ROWS.map(([k, l]) => `${l} ${f2(s[k])}`).join(" · ")}`
    : "신호 축 없음(콜드스타트 또는 취향 없음)";
  return (
    <tr className={picked ? "bg-emerald-50/70" : "hover:bg-[#f7f9fb]"}>
      <Td className="px-3 tabular-nums text-ink-soft">{picked ? <OrderBadge order={c.pick_order!} kind={kind} /> : rank}</Td>
      <Td className="max-w-[22rem] px-3">
        <div className={`truncate ${picked ? "font-medium text-ink" : ""}`} title={c.title}>{c.title}</div>
        <div className="truncate text-xs text-ink-soft">
          {topicNames(c.topics)} · {min(c.duration_sec)}
          {c.episode_no ? ` · ${c.episode_no}편` : ""}{c.is_series_continuation ? " · 다음 편" : ""}
          {c.has_embedding ? "" : " · 임베딩 없음"}
        </div>
      </Td>
      {kind === "discovery" && <Td className="px-3">{c.is_outside_interests ? <Badge tone="done">새 주제</Badge> : <Badge tone="held">관심 안</Badge>}</Td>}
      <Td className="px-3">
        <div className={`tabular-nums ${picked ? "font-semibold text-ink" : ""}`}>{f2(c.score)}</div>
        <div className="mt-1"><PartsBar parts={parts} score={c.score} height="h-1.5" /></div>
      </Td>
      {kind === "regular" ? (
        <>
          <Num v={c.breakdown.embedding} color={AXIS_COLOR.embedding} />
          <Num v={c.breakdown.signal} color={AXIS_COLOR.signal} title={signalTitle} />
          <Num v={c.breakdown.meta} color={AXIS_COLOR.meta} />
          {META_ROWS.map(([k]) => <Num key={k} v={m[k]} color={AXIS_COLOR.meta} soft />)}
        </>
      ) : (
        <>
          <Num v={m.exposure_fatigue} color={DISCOVERY_COLOR.low_exposure} />
          <Num v={m.freshness} color={DISCOVERY_COLOR.freshness} />
          <Num v={m.popularity} color={DISCOVERY_COLOR.quality} />
          <Td className="px-3 text-right tabular-nums">{c.exposure_count ?? "–"}</Td>
        </>
      )}
      <Td className="whitespace-nowrap px-3 text-right tabular-nums text-ink-soft">{c.play_count} / {c.complete_count}</Td>
      <Td className="whitespace-nowrap px-3 text-ink-soft">{fmtTime(c.published_at)}{c.is_evergreen ? " · 에버그린" : ""}</Td>
    </tr>
  );
}

/** 0~1 값 셀 — 값이 클수록 축 색으로 옅게 칠한다. null 은 흐린 –. `soft`는 하위 항목이라 더 옅게 */
function Num({ v, color, title, soft }: { v: number | null; color: string; title?: string; soft?: boolean }) {
  if (v == null) return <td className="px-3 py-2.5 text-right text-ink-soft/50" title={title}>–</td>;
  const alpha = Math.max(0, Math.min(1, v)) * (soft ? 0.16 : 0.24);
  return (
    <td className="px-3 py-2.5 text-right tabular-nums" style={{ background: `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}` }} title={title}>
      {title ? <span className="cursor-help underline decoration-dotted">{f2(v)}</span> : f2(v)}
    </td>
  );
}

function WeightList({ title, items }: { title: string; items: { key: string; name: string | null; weight: number }[] }) {
  if (items.length === 0) return <div className="text-xs text-ink-soft"><span className="font-semibold">{title}</span>: 없음</div>;
  const max = Math.max(...items.map((i) => Math.abs(i.weight)), 0.0001);
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-ink-soft">{title}</div>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.key} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-2 text-xs">
            <span className="truncate" title={i.key}>{i.name ?? i.key}</span>
            <span className="h-2 rounded bg-[#eef1f4]">
              <span
                className={`block h-2 rounded ${i.weight >= 0 ? "bg-brand" : "bg-rose-400"}`}
                style={{ width: `${Math.max(2, (Math.abs(i.weight) / max) * 100)}%` }}
              />
            </span>
            <span className={`text-right tabular-nums ${i.weight < 0 ? "text-rose-700" : ""}`}>{i.weight >= 0 ? "+" : ""}{i.weight.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExcludedList({ title, items }: { title: string; items: { content_id: string; title: string; reason: string }[] }) {
  return (
    <div className="border-t border-line px-4 py-3 text-xs">
      <div className="mb-1 font-semibold text-ink-soft">{title} · {items.length}편</div>
      <ul className="space-y-0.5">
        {items.map((e) => (
          <li key={e.content_id} className="flex gap-2">
            <span className="truncate">{e.title}</span>
            <span className="shrink-0 text-ink-soft">— {EXCLUDE_LABEL[e.reason] ?? e.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
