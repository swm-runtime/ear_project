"use client";
import { useCallback, useEffect, useState } from "react";
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
            서비스 날짜 {data.service_date} · 계산 {fmtTime(data.computed_at)} · 매번 서버에서 다시 계산한다
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

  return (
    <>
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
          sub={`${data.unfinished_limit}편 이상이면 그날 편성을 건너뛴다`}
          tone={(data.unfinished_count ?? 0) >= data.unfinished_limit ? "text-amber-700" : "text-ink"}
        />
        <Stat
          label="취향 상태"
          value={<span className="text-base">{coldStart ? "콜드스타트" : "개인화"}</span>}
          sub={`완청 ${pref.complete_signal_count ?? "–"}건 / 기준 ${pref.cold_start_threshold}건 · 신호 ${pref.signal_count ?? 0}건 · 취향 임베딩 ${pref.has_taste_embedding ? "있음" : "없음"}`}
          tone={coldStart ? "text-amber-700" : "text-ink"}
        />
        <Stat
          label="후보 풀"
          value={`${data.regular?.pool_size ?? 0} · ${data.discovery?.pool_size ?? 0}`}
          sub={`정규 ${data.regular?.candidates.length ?? 0}편 스코어링(게이트 제외 ${data.regular?.gated_out.length ?? 0}) · 탐험 ${data.discovery?.candidates.length ?? 0}편(제외 ${data.discovery?.excluded.length ?? 0})`}
        />
      </div>

      {data.skip_reason && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          지금 배치를 돌리면 이 사용자는 <strong>{SKIP_LABEL[data.skip_reason]}</strong>이다. 아래 편성분은 &ldquo;스킵이 아니었다면 갔을 것&rdquo;이다.
        </div>
      )}
      {data.discovery_error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">탐험 계산 실패: {data.discovery_error}</div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title={`정규 편성 ${regularPicks.length}편 — 관심 주제 안에서`} className="lg:col-span-2">
          <PickList picks={regularPicks} empty="정규 후보가 없다 — 고갈(exhausted)" kind="regular" />
        </Panel>
        <Panel title={`새 주제 ${discoveryPicks.length}편 — 관심 밖 우선`}>
          <PickList picks={discoveryPicks} empty="탐험 후보가 없다" kind="discovery" />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="관심 주제">
          <div className="flex flex-wrap gap-1.5">
            {data.interests.length === 0 && <span className="text-[13px] text-ink-soft">활성 관심 주제가 없다</span>}
            {data.interests.map((t) => (
              <span key={t.topic_id} className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-ink" title={t.source}>
                {t.name ?? t.topic_id.slice(0, 8)} <span className="text-ink-soft">· {t.source}</span>
              </span>
            ))}
          </div>
          {data.removed_topics.length > 0 && (
            <p className="mt-3 text-xs text-ink-soft">
              직접 해제(탐험에서도 제외): {data.removed_topics.map((t) => t.name ?? t.topic_id.slice(0, 8)).join(", ")}
            </p>
          )}
          {data.regular && data.regular.recent_drip_topics.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              최근 14일 편성 주제(노출 피로 감점): {data.regular.recent_drip_topics.map((t) => t.name ?? t.topic_id.slice(0, 8)).join(", ")}
            </p>
          )}
        </Panel>
        <Panel title="오늘 실제 적립된 편성분">
          {data.today_placed.length === 0 ? (
            <p className="text-[13px] text-ink-soft">오늘 서비스 날짜에 배치가 적립한 편이 없다(05:00 배치 전이거나 스킵·고갈).</p>
          ) : (
            <ul className="space-y-1 text-[13px]">
              {data.today_placed.map((c) => <li key={c.content_id} className="truncate">{c.title}</li>)}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-soft">이미 적립된 편은 후보에서 빠진다(라이브러리·제외 기록). 그래서 위 미리보기는 &ldquo;다음 배치&rdquo;의 답이다.</p>
        </Panel>
        <Panel title="가중치">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-ink-soft">축</dt>
            <dd>임베딩 {data.weights.axes.embedding} · 신호 {data.weights.axes.signal} · 메타 {data.weights.axes.meta}</dd>
            <dt className="text-ink-soft">신호 항목</dt>
            <dd>{Object.entries(data.weights.signal_items).map(([k, v]) => `${k} ${v}`).join(" · ")}</dd>
            <dt className="text-ink-soft">메타 항목{coldStart ? "(콜드스타트)" : ""}</dt>
            <dd>{Object.entries(coldStart ? data.weights.meta_items_cold_start : data.weights.meta_items).map(([k, v]) => `${k} ${v}`).join(" · ")}</dd>
            <dt className="text-ink-soft">탐험 항목</dt>
            <dd>{Object.entries(data.weights.discovery_items).map(([k, v]) => `${k} ${v}`).join(" · ")}</dd>
          </dl>
          <p className="mt-2 text-xs text-ink-soft">null 항목은 입력이 없어 축에서 빠지고 나머지 가중치를 다시 정규화한다.</p>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="취향 벡터 — 지금 신호로 계산한 값(저장하지 않음)">
          {coldStart && <p className="mb-2 text-xs text-amber-700">콜드스타트라 임베딩·신호 축은 편성 점수에서 빠진다. 아래 값은 참고용이다.</p>}
          <WeightList title="주제" items={pref.topic_weights} />
          <WeightList title="키워드" items={pref.keyword_weights} />
          <WeightList title="형식" items={pref.format_weights} />
          <WeightList title="저자" items={pref.author_weights} />
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-ink-soft">선호 길이</dt>
            <dd>{pref.duration_pref ? `중앙 ${min(pref.duration_pref.median_sec)} (p25 ${min(pref.duration_pref.p25_sec)} · p75 ${min(pref.duration_pref.p75_sec)})` : "완청·재청취 이력 없음"}</dd>
            <dt className="text-ink-soft">난이도 분포</dt>
            <dd>{pref.difficulty_affinity ? Object.entries(pref.difficulty_affinity).map(([k, v]) => `${k} ${pct(v)}`).join(" · ") : "완청 이력에 난이도 정보 없음"}</dd>
          </dl>
        </Panel>
        <Panel title={`최근 신호 ${data.signals.length}건 — 90일·최대 500건`} flush>
          <div className="max-h-80 overflow-y-auto">
            <Table head={["시각", "행동", "콘텐츠"]} empty="신호가 없다">
              {data.signals.slice(0, 200).map((s, i) => (
                <Tr key={`${s.content_id}-${s.created_at}-${i}`}>
                  <Td className="whitespace-nowrap text-ink-soft">{fmtTime(s.created_at)}</Td>
                  <Td><Badge tone={s.action === "complete" || s.action === "replay" ? "done" : s.action === "unsave" || s.action === "delete" ? "failed" : "held"}>{ACTION_LABEL[s.action] ?? s.action}</Badge></Td>
                  <Td className="max-w-[28rem] truncate">{s.title ?? s.content_id}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        </Panel>
      </div>

      {data.regular && (
        <Panel title={`정규 후보 ${data.regular.candidates.length}편 — 점수 내림차순 (풀 ${data.regular.pool_size}편 중 시리즈 게이트 제외 ${data.regular.gated_out.length}편)`} flush>
          <Table
            head={["#", "콘텐츠", "점수", "임베딩", "신호", "메타", "주제일치", "신선도", "인기도", "난이도", "커리어", "시리즈", "노출피로", "재생/완청", "발행"]}
            empty="후보가 없다"
          >
            {data.regular.candidates.map((c, i) => <CandidateRow key={c.content_id} c={c} rank={i + 1} kind="regular" />)}
          </Table>
          <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">
            순위와 편성 순서가 다르면 다양성 제약이 작용한 것이다 — 임베딩이 있으면 MMR(비슷한 내용 감점), 없으면 같은 주제·저자를 피한다. 시리즈 다음 편은 예외.
          </p>
          {data.regular.gated_out.length > 0 && (
            <ExcludedList title="시리즈 순서 게이트에서 빠진 편" items={data.regular.gated_out} />
          )}
        </Panel>
      )}

      {data.discovery && (
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
          <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">
            선정 순서: 새 주제(관심 밖) 풀 먼저, 그 안에서 정규 편성분과 주제가 겹치지 않는 후보 먼저, 그다음 MMR 재계산 최고점. 그래서 점수 1위가 아닌 편이 뽑힐 수 있다.
          </p>
          {data.discovery.excluded.length > 0 && (
            <ExcludedList title="선정 전에 빠진 편" items={data.discovery.excluded} />
          )}
        </Panel>
      )}
    </>
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
