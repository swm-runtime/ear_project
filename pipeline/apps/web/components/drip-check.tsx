"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Badge, Panel, Stat, Table, Td, Tr, btnCls } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { EarApiError, type EarDripCandidate, type EarDripPreview, getEarDripPreview } from "@/lib/ear";
import { earErrMsg } from "@/app/publish/ear-connect";

/**
 * 편성 미리보기 화면 — 서버 응답을 해석 없이 그대로 펼친다. 점수는 서버가 준 값이고 여기서 다시 계산하는 것은
 * 없다(판정은 서버가 한다). **자동 폴링하지 않는다** — 열 때 1회 + [새로고침]. 한 번의 계산이 후보 300건 × 2를
 * 스코어링하는 조회라, 보고만 있어도 제품 서버를 두드리게 두지 않는다.
 */

const SKIP_LABEL: Record<NonNullable<EarDripPreview["skip_reason"]>, string> = {
  no_interests: "관심 주제 0개 — 편성 스킵",
  unfinished_inventory: "미청취 재고 초과 — 편성 스킵",
  plan_disabled: "플랜 편수 0 — 편성 스킵",
};
const ACTION_LABEL: Record<string, string> = {
  play: "재생", complete: "완청", replay: "재청취", save: "담기", unsave: "담기 해제", delete: "삭제",
};
const EXCLUDE_LABEL: Record<string, string> = {
  episode_order: "시리즈 순서 — 직전 편 미완청",
  user_removed_topic: "사용자가 직접 해제한 주제",
  below_quality_floor: "품질 하한 미달(스무딩 완청률)",
};

const f2 = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(2));
const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const min = (sec: number) => `${Math.round(sec / 60)}분`;

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
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); void load(email); }}
      >
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          className="w-72 rounded border border-line bg-panel px-2.5 py-1.5 text-[13px] text-ink"
          placeholder="대상 사용자 이메일"
        />
        <button type="submit" className={btnCls("primary")} disabled={loading}>
          {loading ? "계산 중…" : "새로고침"}
        </button>
        {data && (
          <span className="text-xs text-ink-soft">
            서비스 날짜 {data.service_date} · 계산 {fmtTime(data.computed_at)} · 매번 서버에서 다시 계산한다 · 아래는 ① 개요 → ② 입력 → ③ 계산식 → ④ 결과 순서
          </span>
        )}
      </form>

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

  return (
    <>
      {/* ── 1. 개요 ─────────────────────────────────────────── */}
      <Section
        no={1}
        title="개요 — 분석 전 확인"
        desc="계산에 들어가기 전에 이 사용자가 오늘 배치 대상인지, 어떤 조건에서 계산되는지 본다. 여기서 '스킵'이면 아래 편성분은 실제로는 가지 않는다."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat
            label="사용자"
            value={<span className="text-base">{data.user.nickname ?? "(닉네임 없음)"}</span>}
            sub={`${data.user.email ?? "-"} · ${data.user.tier}${data.user.job_category ? ` · ${data.user.job_category}` : ""}${data.user.years_of_experience != null ? ` ${data.user.years_of_experience}년+` : ""}`}
          />
          <Stat
            label="편성 판정"
            value={<span className={`text-base ${data.skip_reason ? "text-amber-700" : "text-brand-ink"}`}>{data.skip_reason ? "스킵" : "편성"}</span>}
            sub={data.skip_reason ? SKIP_LABEL[data.skip_reason] : `정규 ${data.drip_count ?? 0}편 · 탐험 ${data.discovery_count ?? 0}편`}
            tone={data.skip_reason ? "text-amber-700" : "text-brand-ink"}
          />
          <Stat
            label="미청취 재고"
            value={`${data.unfinished_count ?? "–"} / ${data.unfinished_limit}`}
            sub={`라이브러리의 미재생 + 진행 중. ${data.unfinished_limit}편 이상이면 그날 편성을 건너뛴다`}
            tone={(data.unfinished_count ?? 0) >= data.unfinished_limit ? "text-amber-700" : "text-ink"}
          />
          <Stat
            label="취향 상태"
            value={<span className="text-base">{coldStart ? "콜드스타트" : "개인화"}</span>}
            sub={`완청 ${pref.complete_signal_count ?? "–"}건 / 기준 ${pref.cold_start_threshold}건 · 취향 임베딩 ${pref.has_taste_embedding ? "있음" : "없음"}`}
            tone={coldStart ? "text-amber-700" : "text-ink"}
          />
          <Stat
            label="후보 풀"
            value={`${data.regular?.pool_size ?? 0} · ${data.discovery?.pool_size ?? 0}`}
            sub={`정규 ${data.regular?.candidates.length ?? 0}편 스코어링(게이트 제외 ${data.regular?.gated_out.length ?? 0}) · 탐험 ${data.discovery?.candidates.length ?? 0}편(제외 ${data.discovery?.excluded.length ?? 0})`}
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Panel title="이대로면 다음 배치에서">
            {data.skip_reason ? (
              <p className="text-[13px] text-amber-800">
                <strong>{SKIP_LABEL[data.skip_reason]}</strong>. 아래 계산은 &ldquo;스킵이 아니었다면 갔을 것&rdquo;을 보여 준다.
              </p>
            ) : (
              <p className="text-[13px] text-ink">
                정규 <strong>{regularPicks.length}편</strong> · 새 주제 <strong>{discoveryPicks.length}편</strong>이 적립된다. 어떤 편인지는 4단계에 있다.
              </p>
            )}
            <ul className="mt-2 space-y-1 text-[13px]">
              {regularPicks.map((c) => <li key={c.content_id} className="truncate">정규 {c.pick_order} · {c.title}</li>)}
              {discoveryPicks.map((c) => <li key={c.content_id} className="truncate">새 주제 · {c.title}</li>)}
            </ul>
            {data.discovery_error && <p className="mt-2 text-xs text-rose-700">탐험 계산 실패: {data.discovery_error}</p>}
          </Panel>
          <Panel title="오늘 실제 적립된 편성분">
            {data.today_placed.length === 0 ? (
              <p className="text-[13px] text-ink-soft">오늘 서비스 날짜(04시 경계)에 배치가 적립한 편이 없다 — 05:00 배치 전이거나 스킵·고갈.</p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {data.today_placed.map((c) => <li key={c.content_id} className="truncate">{c.title}</li>)}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-soft">이미 적립된 편은 후보에서 빠진다(라이브러리·제외 기록). 그래서 이 화면은 항상 &ldquo;다음 배치&rdquo;의 답이다.</p>
          </Panel>
        </div>
      </Section>

      {/* ── 2. 기초 분석 ─────────────────────────────────────── */}
      <Section
        no={2}
        title="기초 분석 — 계산의 입력"
        desc="스코어링이 읽는 사용자 쪽 입력이다. 관심 주제는 후보 풀을 가르고, 최근 신호가 취향 벡터를 만든다. 폰에서 완청·담기·해제를 하면 여기부터 바뀐다."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="관심 주제 — 정규 후보의 범위">
            <div className="flex flex-wrap gap-1.5">
              {data.interests.length === 0 && <span className="text-[13px] text-ink-soft">활성 관심 주제가 없다</span>}
              {data.interests.map((t) => (
                <span key={t.topic_id} className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-ink" title={t.source}>
                  {t.name ?? t.topic_id.slice(0, 8)} <span className="text-ink-soft">· {t.source}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-soft">정규 후보는 이 주제들 중 하나라도 달린 발행 콘텐츠만. 탐험 후보는 주제 제한 없이 시리즈 1편·단편만.</p>
            {data.removed_topics.length > 0 && (
              <p className="mt-2 text-xs text-ink-soft">
                직접 해제(탐험에서도 제외): {data.removed_topics.map((t) => t.name ?? t.topic_id.slice(0, 8)).join(", ")}
              </p>
            )}
            {data.regular && data.regular.recent_drip_topics.length > 0 && (
              <p className="mt-2 text-xs text-ink-soft">
                최근 14일 편성 주제(노출 피로 감점 대상): {data.regular.recent_drip_topics.map((t) => t.name ?? t.topic_id.slice(0, 8)).join(", ")}
              </p>
            )}
          </Panel>
          <Panel title={`최근 신호 ${data.signals.length}건 — 취향 벡터의 재료`} flush className="lg:col-span-2">
            <div className="max-h-72 overflow-y-auto">
              <Table head={["시각", "행동", "콘텐츠"]} empty="신호가 없다 — 재생·완청·담기를 하면 여기 쌓인다">
                {data.signals.slice(0, 200).map((s, i) => (
                  <Tr key={`${s.content_id}-${s.created_at}-${i}`}>
                    <Td className="whitespace-nowrap text-ink-soft">{fmtTime(s.created_at)}</Td>
                    <Td><Badge tone={s.action === "complete" || s.action === "replay" ? "done" : s.action === "unsave" || s.action === "delete" ? "failed" : "held"}>{ACTION_LABEL[s.action] ?? s.action}</Badge></Td>
                    <Td className="max-w-[28rem] truncate">{s.title ?? s.content_id}</Td>
                  </Tr>
                ))}
              </Table>
            </div>
            <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">
              90일·최대 500건. 가중치: 완청·재청취 +1, 담기 +0.5, 담기 해제·삭제 −0.6, 재생 0. 오래된 신호는 14일마다 절반으로 줄어든다. 완청 {pref.cold_start_threshold}건 미만이면 콜드스타트.
            </p>
          </Panel>
        </div>

        <div className="mt-3">
          <Panel title="취향 벡터 — 신호를 합산한 결과 (지금 계산한 값, 저장하지 않음)">
            {coldStart && <p className="mb-2 text-xs text-amber-700">콜드스타트라 임베딩·신호 축은 편성 점수에서 빠진다. 아래 값은 참고용이고, 완청이 {pref.cold_start_threshold}건이 되면 점수에 들어간다.</p>}
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <WeightList title="주제 — 신호가 쌓인 주제일수록 +, 해제·삭제한 주제는 −" items={pref.topic_weights} />
                <WeightList title="키워드" items={pref.keyword_weights} />
              </div>
              <div>
                <WeightList title="형식" items={pref.format_weights} />
                <WeightList title="저자" items={pref.author_weights} />
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-ink-soft">선호 길이</dt>
                  <dd>{pref.duration_pref ? `중앙 ${min(pref.duration_pref.median_sec)} (p25 ${min(pref.duration_pref.p25_sec)} · p75 ${min(pref.duration_pref.p75_sec)})` : "완청·재청취 이력 없음"}</dd>
                  <dt className="text-ink-soft">난이도 분포</dt>
                  <dd>{pref.difficulty_affinity ? Object.entries(pref.difficulty_affinity).map(([k, v]) => `${k} ${pct(v)}`).join(" · ") : "완청 이력에 난이도 정보 없음"}</dd>
                  <dt className="text-ink-soft">취향 임베딩</dt>
                  <dd>{pref.has_taste_embedding ? "있음 — 완청·담기한 콘텐츠 임베딩의 가중 평균" : "없음 — 긍정 신호 콘텐츠에 임베딩이 없거나 신호 없음"}</dd>
                </dl>
              </div>
            </div>
          </Panel>
        </div>
      </Section>

      {/* ── 3. 계산 ─────────────────────────────────────────── */}
      <Section
        no={3}
        title="계산 — 점수는 이렇게 나온다"
        desc="후보마다 아래 식으로 점수를 내고, 점수 순서에 다양성 제약을 얹어 뽑는다. 표의 열 이름이 이 식의 항목이다. null(–)은 입력이 없어 그 항목을 빼고 나머지 가중치를 다시 정규화했다는 뜻이다."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="정규 편성 점수 (3축)">
            <Formula
              head={`점수 = ${w.axes.embedding}×임베딩 + ${w.axes.signal}×신호 + ${w.axes.meta}×메타`}
              rows={[
                ["임베딩", "취향 임베딩과 콘텐츠 임베딩의 코사인 유사도를 0~1로. 콜드스타트·임베딩 없음이면 빠진다"],
                ["신호", `취향 벡터 대조 — 주제 ${w.signal_items.topic_preference} · 저자 ${w.signal_items.author_preference} · 키워드 ${w.signal_items.keyword_match} · 형식 ${w.signal_items.format_preference} · 길이 ${w.signal_items.duration_closeness}. 콜드스타트면 빠진다`],
                ["메타", `콘텐츠 자체의 규칙 — 주제일치 ${metaW.topic_match} · 신선도 ${metaW.freshness} · 인기도 ${metaW.popularity} · 난이도 ${metaW.difficulty_fit} · 커리어 ${metaW.career_fit} · 시리즈 ${metaW.series_continuity} · 노출피로 ${metaW.exposure_fatigue}${coldStart ? " (콜드스타트 가중치: 신선도·인기도를 키운다)" : ""}`],
              ]}
            />
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-ink-soft">주제일치</dt><dd>관심 주제와 겹치는 수 — 1개 0.6, 2개 0.8, 3개 이상 1</dd>
              <dt className="text-ink-soft">신선도</dt><dd>발행 후 경과일에 반감기 적용 — 시의성 30일, 미지정 90일, 에버그린은 항상 1</dd>
              <dt className="text-ink-soft">인기도</dt><dd>0.7×스무딩 완청률(재생 20회 미만은 풀 평균으로 끌어당김) + 0.3×재생 수 로그</dd>
              <dt className="text-ink-soft">난이도</dt><dd>완청 이력의 난이도 분포와 대조. 콜드스타트는 beginner 1 · intermediate 0.5 · advanced 0.2</dd>
              <dt className="text-ink-soft">커리어</dt><dd>직군·연차 vs 콘텐츠 청자 세트 — 정확 1 · 이웃 연차 0.6 · 직군만 0.3 · 불일치 0</dd>
              <dt className="text-ink-soft">시리즈</dt><dd>완청한 시리즈의 바로 다음 편이면 1(강한 가점), 아니면 항목 자체가 빠진다</dd>
              <dt className="text-ink-soft">노출피로</dt><dd>1 − (최근 14일 편성 주제와 겹치는 비율) — 같은 주제만 계속 가는 것을 막는다</dd>
            </dl>
          </Panel>
          <Panel title="탐험(새 주제) 점수와 선정 순서">
            <Formula
              head={`점수 = ${w.discovery_items.low_exposure}×저노출 + ${w.discovery_items.freshness}×신선도 + ${w.discovery_items.quality}×품질`}
              rows={[
                ["저노출", "1 / (1 + 전 사용자 편성 이력 수) — 아무에게도 안 간 편이 1"],
                ["신선도", "정규와 같은 반감기 규칙"],
                ["품질", "스무딩 완청률 — 재생 5회 미만은 판정 면제"],
              ]}
            />
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-ink">
              <li>사용자가 직접 해제한 주제의 편 제외</li>
              <li>스무딩 완청률이 품질 하한{data.discovery ? ` ${pct(data.discovery.quality_floor)}` : ""} 미만이면 제외 (하한 = min(20%, 풀 전형 완청률의 절반))</li>
              <li><strong>관심 밖 주제(새 주제) 풀 먼저</strong>, 없으면 관심 안 저노출도 허용</li>
              <li>각 풀 안에서 정규 편성분과 주제가 겹치지 않는 편 먼저</li>
              <li>그다음 MMR 재계산 최고점 — 정규 편과 내용이 비슷하면 감점</li>
            </ol>
            <p className="mt-3 border-t border-line pt-2 text-xs text-ink-soft">
              <strong>정규 선정(다양성)</strong>: 점수순으로 뽑되 이미 뽑은 편과 임베딩이 비슷하면 λ 0.3만큼 감점(MMR), 임베딩이 없으면 같은 주제·저자를 피한다. 시리즈 다음 편은 예외. 그래서 표의 순위와 편성 순서가 다를 수 있다.
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              <strong>후보에서 미리 빠지는 것</strong>: 라이브러리에 있거나 제외 기록(재생·삭제·담기 해제·과거 편성)이 있는 편, 직전 편을 완청하지 않은 시리즈 중간 편, 라이선스 만료·회수된 편.
            </p>
          </Panel>
        </div>
      </Section>

      {/* ── 4. 결과 ─────────────────────────────────────────── */}
      <Section
        no={4}
        title="결과 — 후보 전체 점수와 최종 편성"
        desc="3단계 식을 후보 전부에 적용한 표다. 초록 행이 최종 편성분이고 숫자는 편성 순서다. 순위와 편성 순서가 다르면 다양성 제약이 작용한 것이다."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title={`정규 편성 ${regularPicks.length}편 — 관심 주제 안에서`} className="lg:col-span-2">
            <PickList picks={regularPicks} empty="정규 후보가 없다 — 고갈(exhausted). 관심 주제에 안 본 콘텐츠가 더 없다" kind="regular" />
          </Panel>
          <Panel title={`새 주제 ${discoveryPicks.length}편 — 관심 밖 우선`}>
            <PickList picks={discoveryPicks} empty="탐험 후보가 없다" kind="discovery" />
          </Panel>
        </div>

        {data.regular && (
          <div className="mt-3">
            <Panel title={`정규 후보 ${data.regular.candidates.length}편 — 점수 내림차순 (풀 ${data.regular.pool_size}편 중 시리즈 게이트 제외 ${data.regular.gated_out.length}편)`} flush>
              <Table
                head={["#", "콘텐츠", "점수", "임베딩", "신호", "메타", "주제일치", "신선도", "인기도", "난이도", "커리어", "시리즈", "노출피로", "재생/완청", "발행"]}
                empty="후보가 없다"
              >
                {data.regular.candidates.map((c, i) => <CandidateRow key={c.content_id} c={c} rank={i + 1} kind="regular" />)}
              </Table>
              <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">
                신호 열에 마우스를 올리면 항목별(주제·저자·키워드·형식·길이) 점수가 보인다.
              </p>
              {data.regular.gated_out.length > 0 && (
                <ExcludedList title="시리즈 순서 게이트에서 빠진 편" items={data.regular.gated_out} />
              )}
            </Panel>
          </div>
        )}

        {data.discovery && (
          <div className="mt-3">
            <Panel
              title={`탐험 후보 ${data.discovery.candidates.length}편 — 관심 밖(새 주제) 우선 · 품질 하한 ${pct(data.discovery.quality_floor)} (풀 전형 완청률 ${pct(data.discovery.typical_complete_rate)})`}
              flush
            >
              <Table
                head={["#", "콘텐츠", "새 주제?", "점수", "저노출", "신선도", "품질", "노출 수", "재생/완청", "발행"]}
                empty="후보가 없다"
              >
                {data.discovery.candidates.map((c, i) => <CandidateRow key={c.content_id} c={c} rank={i + 1} kind="discovery" />)}
              </Table>
              {data.discovery.excluded.length > 0 && (
                <ExcludedList title="선정 전에 빠진 편" items={data.discovery.excluded} />
              )}
            </Panel>
          </div>
        )}
      </Section>
    </>
  );
}

/** 단계 머리 — 번호·제목·이 단계에서 무엇을 보는지 한 줄 */
function Section({ no, title, desc, children }: { no: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3 border-b border-line pb-2 pt-2">
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

/** 계산식 — 한 줄 식 + 항목 설명 표 */
function Formula({ head, rows }: { head: string; rows: [string, string][] }) {
  return (
    <div>
      <code className="block rounded bg-[#f7f9fb] px-3 py-2 text-[12.5px] text-ink">{head}</code>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="font-semibold text-ink">{k}</dt>
            <dd className="text-ink-soft">{v}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

function PickList({ picks, empty, kind }: { picks: EarDripCandidate[]; empty: string; kind: "regular" | "discovery" }) {
  if (picks.length === 0) return <p className="text-[13px] text-ink-soft">{empty}</p>;
  return (
    <ol className="space-y-2">
      {picks.map((c) => (
        <li key={c.content_id} className="flex items-start gap-3 rounded border border-line bg-[#f7f9fb] px-3 py-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">{c.pick_order}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-ink">{c.title}</div>
            <div className="mt-0.5 text-xs text-ink-soft">
              {c.topics.map((t) => t.name ?? t.topic_id.slice(0, 8)).join(" · ") || "주제 없음"} · {min(c.duration_sec)}
              {c.author_name ? ` · ${c.author_name}` : ""}
              {c.is_series_continuation ? " · 시리즈 다음 편" : ""}
              {kind === "discovery" ? (c.is_outside_interests ? " · 관심 밖" : " · 관심 안(저노출)") : ""}
            </div>
            <div className="mt-1 text-xs text-ink-soft">
              점수 <strong className="text-ink">{f2(c.score)}</strong>
              {kind === "regular"
                ? ` · 임베딩 ${f2(c.breakdown.embedding)} · 신호 ${f2(c.breakdown.signal)} · 메타 ${f2(c.breakdown.meta)}`
                : ` · 저노출 ${f2(c.breakdown.meta_items.exposure_fatigue)} · 신선도 ${f2(c.breakdown.meta_items.freshness)} · 품질 ${f2(c.breakdown.meta_items.popularity)}`}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CandidateRow({ c, rank, kind }: { c: EarDripCandidate; rank: number; kind: "regular" | "discovery" }) {
  const picked = c.pick_order !== null;
  const m = c.breakdown.meta_items;
  const s = c.breakdown.signal_items;
  const signalTitle = s
    ? `신호 항목 — 주제 ${f2(s.topic_preference)} · 저자 ${f2(s.author_preference)} · 키워드 ${f2(s.keyword_match)} · 형식 ${f2(s.format_preference)} · 길이 ${f2(s.duration_closeness)}`
    : "신호 축 없음(콜드스타트 또는 취향 없음)";
  const cellCls = picked ? "font-medium text-ink" : "";
  return (
    <tr className={picked ? "bg-emerald-50/60" : "hover:bg-[#f7f9fb]"}>
      <Td className="tabular-nums text-ink-soft">{picked ? <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-white">{c.pick_order}</span> : rank}</Td>
      <Td className="max-w-[24rem]">
        <div className={`truncate ${cellCls}`} title={c.title}>{c.title}</div>
        <div className="truncate text-xs text-ink-soft">
          {c.topics.map((t) => t.name ?? t.topic_id.slice(0, 8)).join(" · ") || "주제 없음"} · {min(c.duration_sec)}
          {c.episode_no ? ` · ${c.episode_no}편` : ""}{c.is_series_continuation ? " · 다음 편" : ""}
          {c.has_embedding ? "" : " · 임베딩 없음"}
        </div>
      </Td>
      {kind === "discovery" && <Td>{c.is_outside_interests ? <Badge tone="done">새 주제</Badge> : <Badge tone="held">관심 안</Badge>}</Td>}
      <Td className={`tabular-nums ${cellCls}`}>{f2(c.score)}</Td>
      {kind === "regular" ? (
        <>
          <Td className="tabular-nums">{f2(c.breakdown.embedding)}</Td>
          <Td className="tabular-nums"><span title={signalTitle} className="cursor-help underline decoration-dotted">{f2(c.breakdown.signal)}</span></Td>
          <Td className="tabular-nums">{f2(c.breakdown.meta)}</Td>
          <Td className="tabular-nums">{f2(m.topic_match)}</Td>
          <Td className="tabular-nums">{f2(m.freshness)}</Td>
          <Td className="tabular-nums">{f2(m.popularity)}</Td>
          <Td className="tabular-nums">{f2(m.difficulty_fit)}</Td>
          <Td className="tabular-nums">{f2(m.career_fit)}</Td>
          <Td className="tabular-nums">{f2(m.series_continuity)}</Td>
          <Td className="tabular-nums">{f2(m.exposure_fatigue)}</Td>
        </>
      ) : (
        <>
          <Td className="tabular-nums">{f2(m.exposure_fatigue)}</Td>
          <Td className="tabular-nums">{f2(m.freshness)}</Td>
          <Td className="tabular-nums">{f2(m.popularity)}</Td>
          <Td className="tabular-nums">{c.exposure_count ?? "–"}</Td>
        </>
      )}
      <Td className="whitespace-nowrap tabular-nums text-ink-soft">{c.play_count} / {c.complete_count}</Td>
      <Td className="whitespace-nowrap text-ink-soft">{fmtTime(c.published_at)}{c.is_evergreen ? " · 에버그린" : ""}</Td>
    </tr>
  );
}

function WeightList({ title, items }: { title: string; items: { key: string; name: string | null; weight: number }[] }) {
  if (items.length === 0) return <div className="mb-2 text-xs text-ink-soft">{title}: 없음</div>;
  const max = Math.max(...items.map((i) => Math.abs(i.weight)), 0.0001);
  return (
    <div className="mb-3">
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
            <span className="text-right tabular-nums">{i.weight >= 0 ? "+" : ""}{i.weight.toFixed(2)}</span>
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
