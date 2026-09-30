"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Panel, btnCls } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import {
  EarApiError, type EarContent, type EarDripCandidate, type EarDripPreview, type EarExploreFeed, type EarTopic,
  type RecommendTestAccount, type RecommendTestAction, getEarDripPreview, getRecommendTestAccount, getRecommendTestFeed,
  listEarContentsOn, listEarTopicsOn, postRecommendTestAction, putRecommendTestCareer, putRecommendTestInterests, resetRecommendTest,
} from "@/lib/ear";
import { diffRanked, rankMark, type RankDiff } from "@/lib/recommend-test-diff";
import { earErrMsg } from "@/app/publish/ear-connect";

/**
 * 추천 테스트 화면 — 왼쪽에서 행동을 넣고 오른쪽에서 결과를 본다.
 *
 * 판정·계산은 전부 서버가 한다. 이 화면이 스스로 하는 것은 ① 행동 뒤 결과 세 가지(계정·미리보기·피드)를 다시 부르는 것,
 * ② 직전 결과와의 순위 차이를 표식(NEW ▲ ▼)으로 붙이는 것, ③ 행동 로그를 브라우저 메모리에 쌓는 것뿐이다.
 * 결과 재조회는 행동마다 자동이지만 **폴링은 하지 않는다** — 미리보기 한 번이 후보 수백 건을 스코어링하는 조회다.
 */

const ACTIONS: { action: RecommendTestAction; label: string; hint: string; kind: "ghost" | "danger" }[] = [
  { action: "play", label: "재생", hint: "재생 시작 — 없으면 자동 적립 후 play 신호·오늘 한도 차감·드립 영구 제외", kind: "ghost" },
  { action: "complete", label: "완청", hint: "재생 시작 후 위치를 끝까지 저장 → complete 신호(강한 긍정)", kind: "ghost" },
  { action: "save", label: "담기", hint: "라이브러리에 담기 → save 신호(긍정)", kind: "ghost" },
  { action: "replay", label: "재청취", hint: "완료 항목에만 replay 신호 — 완료 전이면 앱과 같이 무시", kind: "ghost" },
  { action: "unsave", label: "해제", hint: "담기 해제 → unsave 신호(부정)·드립 영구 제외", kind: "danger" },
  { action: "delete", label: "삭제", hint: "라이브러리 삭제 → delete 신호(부정)·드립 영구 제외. 라이브러리에 있어야 한다", kind: "danger" },
];
const STATUS_LABEL: Record<string, string> = { unplayed: "미청취", in_progress: "듣는 중", completed: "완청" };
const STATUS_TONE: Record<string, string> = { unplayed: "queued", in_progress: "running", completed: "done" };
const SIGNAL_TONE: Record<string, string> = { complete: "done", replay: "done", save: "approved", play: "held", unsave: "failed", delete: "failed", ignore: "queued" };
const YEARS = ["0-1", "2-3", "4-6", "7+"];
const MAX_LOG = 60;
const CATALOG_MAX = 500;

type LogEntry = { at: string; title: string; label: string; effects: string[]; error?: string };
type Snapshot = { preview: EarDripPreview | null; feed: EarExploreFeed | null };
type Ranks = { regular: string[] | null; discovery: string[] | null; feed: Record<string, string[]> };
type Diffs = { regular: RankDiff; discovery: RankDiff; feed: Record<string, RankDiff> };
type CareerBody = { job_category: string | null; job_title: string | null; years_of_experience: string | null };

export function RecommendTest() {
  const [account, setAccount] = useState<RecommendTestAccount | null>(null);
  const [snap, setSnap] = useState<Snapshot>({ preview: null, feed: null });
  const prevRanks = useRef<Ranks>({ regular: null, discovery: null, feed: {} });
  const [diff, setDiff] = useState<Diffs | null>(null);
  const [contents, setContents] = useState<EarContent[]>([]);
  const [topics, setTopics] = useState<EarTopic[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const pushLog = (entry: LogEntry) => setLog((l) => [entry, ...l].slice(0, MAX_LOG));

  /** 결과 세 가지를 다시 부른다 — 직전 순위를 기억해 두고 차이를 붙인다 */
  const refresh = useCallback(async (markDiff: boolean) => {
    const acc = await getRecommendTestAccount();
    setAccount(acc);
    const email = acc.user.email;
    const [preview, feed] = await Promise.all([
      email ? getEarDripPreview(email, "dev").catch((e: unknown) => { setErr(`편성 미리보기 실패: ${earErrMsg(e)}`); return null; }) : Promise.resolve(null),
      getRecommendTestFeed().catch((e: unknown) => { setErr(`탐색 피드 실패: ${earErrMsg(e)}`); return null; }),
    ]);
    const regular = picks(preview?.regular?.candidates).map((c) => c.content_id);
    const discovery = picks(preview?.discovery?.candidates).map((c) => c.content_id);
    const feedRanks: Record<string, string[]> = {};
    for (const s of feed?.sections ?? []) feedRanks[sectionKey(s)] = s.items.map((i) => i.content.id);
    const prev = prevRanks.current;
    const feedDiff: Record<string, RankDiff> = {};
    for (const [k, ids] of Object.entries(feedRanks)) feedDiff[k] = diffRanked(markDiff ? (prev.feed[k] ?? null) : null, ids);
    setDiff({
      regular: diffRanked(markDiff ? prev.regular : null, regular),
      discovery: diffRanked(markDiff ? prev.discovery : null, discovery),
      feed: feedDiff,
    });
    prevRanks.current = { regular, discovery, feed: feedRanks };
    setSnap({ preview, feed });
  }, []);

  /** 콘텐츠·주제 목록 — 기존 관리자 API 를 개발계 채널로 */
  const loadCatalog = useCallback(async () => {
    const [topicRes, first] = await Promise.all([listEarTopicsOn("dev"), listEarContentsOn("dev", "published", 0, 50)]);
    setTopics(topicRes.items);
    const rest: EarContent[] = [];
    for (let off = 50; off < first.total && off < CATALOG_MAX; off += 50) rest.push(...(await listEarContentsOn("dev", "published", off, 50)).items);
    setContents([...first.items, ...rest]);
  }, []);

  useEffect(() => {
    // 마운트 직후 1회 — 효과 안에서 바로 setState 하지 않도록 한 틱 미룬다
    const timer = setTimeout(() => {
      void (async () => {
        setBusy("불러오는 중");
        setErr(null);
        try { await Promise.all([refresh(false), loadCatalog()]); }
        catch (e) { setErr(describe(e)); }
        finally { setBusy(null); }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh, loadCatalog]);

  /** 행동·입력 변경의 공통 틀 — 서버 호출 → 로그 → 결과 재조회(차이 표시) */
  const run = async (label: string, title: string, call: () => Promise<string[]>) => {
    setBusy(`${label} · ${title}`);
    setErr(null);
    try {
      const effects = await call();
      pushLog({ at: new Date().toISOString(), title, label, effects });
      await refresh(true);
    } catch (e) {
      const msg = describe(e);
      pushLog({ at: new Date().toISOString(), title, label, effects: [], error: msg });
      setErr(msg);
    } finally {
      setBusy(null);
    }
  };
  const act = (action: RecommendTestAction, content: EarContent) =>
    run(ACTIONS.find((a) => a.action === action)?.label ?? action, content.title, async () => (await postRecommendTestAction(action, content.id)).effects);
  const saveInterests = (ids: string[]) =>
    run("관심 주제", `${ids.length}개 주제`, async () => { await putRecommendTestInterests(ids); return ["관심 주제 전체 교체 — 정규 후보 범위가 바뀐다"]; });
  const saveCareer = (body: CareerBody) =>
    run("커리어", `${body.job_category ?? "-"} · ${body.years_of_experience ?? "-"}`, async () => { await putRecommendTestCareer(body); return ["직군·연차 교체 — 메타 축 career_fit 입력"]; });
  const reset = () => {
    if (!window.confirm("테스트 계정의 신호·재생 기록·라이브러리·취향 캐시·드립 제외를 전부 지웁니다. 관심 주제·커리어는 남습니다. 계속할까요?")) return;
    void run("초기화", "테스트 계정", async () => { await resetRecommendTest(); return ["소비 이력 전부 삭제 — 오늘 재생 한도도 풀림"]; });
  };
  const refreshOnly = () => run("새로고침", "결과", async () => []);

  const libraryByContent = useMemo(() => new Map((account?.library ?? []).map((i) => [i.content_id, i])), [account]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? contents.filter((c) => c.title.toLowerCase().includes(q) || (c.author_name ?? "").toLowerCase().includes(q) || c.topics.some((t) => t.name.toLowerCase().includes(q))) : contents;
  }, [contents, query]);
  const interestIds = useMemo(() => (account?.interests ?? []).map((i) => i.topic_id), [account]);
  const regularPicks = picks(snap.preview?.regular?.candidates);
  const discoveryPicks = picks(snap.preview?.discovery?.candidates);

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-[5] -mx-6 flex flex-wrap items-center gap-2 border-b border-line bg-[#eef1f5]/95 px-6 py-2 backdrop-blur">
        <Badge tone="running">개발계</Badge>
        {account && (
          <span className="text-xs text-ink-soft">
            테스트 계정 <strong className="text-ink">{account.user.email ?? account.user.id}</strong> · {account.user.tier}
            {account.user.job_category ? ` · ${account.user.job_category}` : ""}{account.user.years_of_experience != null ? ` ${account.user.years_of_experience}년+` : ""}
            {account.user.onboarding_completed ? "" : " · 온보딩 미완(편성 스킵)"}
          </span>
        )}
        {snap.feed && snap.feed.daily_play_limit !== null && (
          <span className="text-xs text-ink-soft">· 오늘 재생 {snap.feed.daily_play_count}/{snap.feed.daily_play_limit} (서비스 날짜 {snap.feed.service_date})</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {busy && <span className="text-xs text-ink-soft">{busy}…</span>}
          <button className={btnCls("ghost")} disabled={!!busy} onClick={() => void refreshOnly()}>결과 새로고침</button>
          <button className={btnCls("danger")} disabled={!!busy} onClick={reset}>초기화</button>
        </span>
      </div>

      {err && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{err}</p>}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ── 왼쪽: 행동 입력 ── */}
        <div className="space-y-4 lg:col-span-2">
          <Panel
            title={`콘텐츠 ${filtered.length}편 — 행동 버튼`}
            right={<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목·저자·주제 검색" className="w-44 rounded border border-line bg-panel px-2 py-1 text-xs text-ink" />}
            flush
          >
            <ul className="max-h-[42rem] divide-y divide-line overflow-y-auto">
              {filtered.length === 0 && <li className="px-4 py-6 text-center text-xs text-ink-soft">{contents.length === 0 ? "개발계에 발행된 콘텐츠가 없다" : "검색 결과 없음"}</li>}
              {filtered.map((c) => {
                const item = libraryByContent.get(c.id);
                return (
                  <li key={c.id} className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink" title={c.title}>{c.title}</div>
                        <div className="mt-0.5 truncate text-[11px] text-ink-soft">{c.topics.map((t) => t.name).join(" · ") || "주제 없음"} · {fmtMin(c.duration_sec)}{c.author_name ? ` · ${c.author_name}` : ""}</div>
                      </div>
                      {item ? <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status] ?? item.status}{item.source !== "save" ? ` · ${item.source}` : ""}</Badge> : <span className="text-[11px] text-ink-soft">라이브러리 밖</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {ACTIONS.map((a) => (
                        <button key={a.action} className={btnCls(a.kind)} title={a.hint} disabled={!!busy} onClick={() => void act(a.action, c)}>{a.label}</button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* 서버 값이 바뀌면 key 로 다시 마운트해 초안을 버린다 — 효과 안에서 setState 하지 않는다 */}
          <InterestsEditor key={interestIds.join(",")} topics={topics} selected={interestIds} disabled={!!busy} onSave={saveInterests} />
          <CareerEditor key={careerKey(account)} account={account} disabled={!!busy} onSave={saveCareer} />
        </div>

        {/* ── 오른쪽: 결과 ── */}
        <div className="space-y-4 lg:col-span-3">
          <Panel
            title="편성 미리보기 — 다음 배치에서 갈 정규 · 새 주제"
            right={snap.preview && (
              <span className="text-xs text-ink-soft">
                계산 {fmtTime(snap.preview.computed_at)} · {snap.preview.skip_reason ? <span className="text-rose-700">스킵 사유 {snap.preview.skip_reason}</span> : `정규 후보 ${snap.preview.regular?.candidates.length ?? 0} · 탐험 후보 ${snap.preview.discovery?.candidates.length ?? 0}`}
              </span>
            )}
          >
            {!snap.preview ? <p className="text-xs text-ink-soft">미리보기를 불러오지 못했다</p> : (
              <div className="grid gap-3 md:grid-cols-2">
                <PickColumn title={`정규 ${regularPicks.length}편 — 관심 주제 안`} picks={regularPicks} diff={diff?.regular} removedTitles={titlesOf(diff?.regular.removed, snap)} />
                <PickColumn title={`새 주제 ${discoveryPicks.length}편 — 관심 밖 우선`} picks={discoveryPicks} diff={diff?.discovery} removedTitles={titlesOf(diff?.discovery.removed, snap)} />
              </div>
            )}
            {snap.preview && <TopCandidates preview={snap.preview} />}
          </Panel>

          <Panel title="탐색 피드 — 앱 탐색 화면이 받는 순서" right={snap.feed && <span className="text-xs text-ink-soft">섹션 {snap.feed.sections.length}</span>}>
            {!snap.feed ? <p className="text-xs text-ink-soft">피드를 불러오지 못했다</p> : snap.feed.sections.length === 0 ? <p className="text-xs text-ink-soft">섹션 없음 — 빈 피드(정상 상태)</p> : (
              <div className="grid gap-3 md:grid-cols-2">
                {snap.feed.sections.map((s) => {
                  const d = diff?.feed[sectionKey(s)];
                  return (
                    <div key={sectionKey(s)} className="rounded border border-line">
                      <div className="flex items-center gap-2 border-b border-line bg-[#f7f9fb] px-3 py-1.5 text-xs font-semibold text-ink">{s.title}<span className="ml-auto font-normal text-ink-soft">{s.key}{s.period ? ` · ${s.period}` : ""}</span></div>
                      <ol className="divide-y divide-line">
                        {s.items.map((it, i) => (
                          <li key={it.content.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
                            <span className="w-4 text-right tabular-nums text-ink-soft">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate text-ink" title={it.content.title}>{it.content.title}</span>
                            {it.library && <Badge tone={STATUS_TONE[it.library.status]}>{STATUS_LABEL[it.library.status] ?? it.library.status}</Badge>}
                            <Mark mark={rankMark(d?.changes.get(it.content.id))} />
                          </li>
                        ))}
                        {(d?.removed.length ?? 0) > 0 && <li className="px-3 py-1.5 text-[11px] text-ink-soft">빠짐: {titlesOf(d?.removed, snap).join(", ")}</li>}
                      </ol>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {snap.preview && <PreferenceSummary preview={snap.preview} />}

          <Panel title={`행동 로그 ${log.length}건 — 이 브라우저에서 한 것`} right={log.length > 0 && <button className={btnCls("ghost")} onClick={() => setLog([])}>지우기</button>}>
            {log.length === 0 ? <p className="text-xs text-ink-soft">아직 한 행동이 없다. 왼쪽 버튼을 누르면 여기 쌓인다</p> : (
              <ol className="divide-y divide-line text-[12.5px]">
                {log.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                    <span className="tabular-nums text-ink-soft">{fmtTime(e.at)}</span>
                    <Badge tone={e.error ? "failed" : "done"}>{e.label}</Badge>
                    <span className="truncate text-ink" title={e.title}>{e.title}</span>
                    <span className="basis-full text-[11.5px] text-ink-soft">{e.error ? <span className="text-rose-700">{e.error}</span> : e.effects.join(" · ")}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ── 조각 ── */

const sectionKey = (s: EarExploreFeed["sections"][number]) => s.key + (s.topic?.id ?? "");
function picks(cands: EarDripCandidate[] | undefined): EarDripCandidate[] {
  return (cands ?? []).filter((c) => c.pick_order !== null).sort((a, b) => a.pick_order! - b.pick_order!);
}
function titlesOf(ids: string[] | undefined, snap: Snapshot): string[] {
  if (!ids?.length) return [];
  const names = new Map<string, string>();
  for (const c of [...(snap.preview?.regular?.candidates ?? []), ...(snap.preview?.discovery?.candidates ?? [])]) names.set(c.content_id, c.title);
  for (const s of snap.feed?.sections ?? []) for (const it of s.items) names.set(it.content.id, it.content.title);
  return ids.map((id) => names.get(id) ?? id.slice(0, 8));
}
const fmtMin = (sec: number) => `${Math.round(sec / 60)}분`;
const fmt = (v: number | null) => (v === null ? "–" : v.toFixed(2));
function describe(e: unknown): string {
  if (e instanceof EarApiError) {
    if (e.errorCode === "ADMIN_RECOMMEND_TEST_DISABLED") return `${e.message} (서버 env RECOMMEND_TEST_EMAIL · SENTRY_ENVIRONMENT 확인)`;
    if (e.status === 404 && e.errorCode !== "NOT_FOUND") return "개발계 서버에 추천 테스트 API 가 아직 배포되지 않았어요 (404)";
    return e.errorCode ? `${e.message} [${e.errorCode}]` : e.message;
  }
  return earErrMsg(e);
}

function Mark({ mark }: { mark: string }) {
  if (!mark) return null;
  const cls = mark === "NEW" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : mark.startsWith("▲") ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-amber-50 text-amber-800 ring-amber-200";
  return <span className={`rounded px-1 text-[10.5px] font-semibold ring-1 ring-inset ${cls}`}>{mark}</span>;
}

function PickColumn({ title, picks: list, diff, removedTitles }: { title: string; picks: EarDripCandidate[]; diff: RankDiff | undefined; removedTitles: string[] }) {
  return (
    <div className="rounded border border-line">
      <div className="border-b border-line bg-[#f7f9fb] px-3 py-1.5 text-xs font-semibold text-ink">{title}</div>
      {list.length === 0 ? <p className="px-3 py-3 text-xs text-ink-soft">편성분 없음 — 후보 고갈 또는 스킵</p> : (
        <ol className="divide-y divide-line">
          {list.map((c) => (
            <li key={c.content_id} className="px-3 py-2 text-[12.5px]">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-brand text-[11px] font-semibold text-white">{c.pick_order}</span>
                <span className="min-w-0 flex-1 truncate text-ink" title={c.title}>{c.title}</span>
                <span className="tabular-nums text-ink-soft">{c.score.toFixed(3)}</span>
                <Mark mark={rankMark(diff?.changes.get(c.content_id))} />
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 pl-7 text-[11px] text-ink-soft">
                <span>{c.topics.map((t) => t.name ?? "?").join(" · ") || "주제 없음"}</span>
                <span>임베딩 {fmt(c.breakdown.embedding)} · 신호 {fmt(c.breakdown.signal)} · 메타 {fmt(c.breakdown.meta)}</span>
                {c.is_series_continuation && <span className="text-teal-700">시리즈 다음 편</span>}
                {c.is_outside_interests && <span>관심 밖</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {removedTitles.length > 0 && <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-soft">직전 편성분에서 빠짐: {removedTitles.join(", ")}</p>}
    </div>
  );
}

/** 후보 상위 — 편성분 바로 아래 순위가 어떻게 밀리는지 보려면 상위 몇 편이 더 필요하다 */
function TopCandidates({ preview }: { preview: EarDripPreview }) {
  const [open, setOpen] = useState(false);
  const rows = [...(preview.regular?.candidates ?? [])].sort((a, b) => b.score - a.score).slice(0, 12);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <button className="text-xs text-ink-soft underline-offset-2 hover:underline" onClick={() => setOpen((v) => !v)}>{open ? "정규 후보 상위 12 접기" : `정규 후보 상위 12 보기 (전체 ${preview.regular?.candidates.length ?? 0})`}</button>
      {open && (
        <ol className="mt-2 divide-y divide-line rounded border border-line text-[12px]">
          {rows.map((c, i) => (
            <li key={c.content_id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-5 text-right tabular-nums text-ink-soft">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink" title={c.title}>{c.title}</span>
              {c.pick_order !== null && <Badge tone="approved">편성 {c.pick_order}</Badge>}
              <span className="tabular-nums text-ink-soft">{c.score.toFixed(3)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PreferenceSummary({ preview }: { preview: EarDripPreview }) {
  const p = preview.preference;
  const recent = preview.signals.slice(0, 12);
  return (
    <Panel title="취향 · 최근 신호 — 행동이 어떻게 쌓였나" right={<span className="text-xs text-ink-soft">{p.is_cold_start ? `콜드스타트 (완청 ${p.complete_signal_count ?? 0}/${p.cold_start_threshold})` : `완청 ${p.complete_signal_count}`} · 신호 {p.signal_count ?? 0}건 · 취향 벡터 {p.has_taste_embedding ? "있음" : "없음"}</span>}>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">주제 가중치 (행동으로 학습)</div>
          {p.topic_weights.length === 0 ? <p className="text-xs text-ink-soft">아직 없음 — 완청·담기를 해보자</p> : (
            <ul className="space-y-1 text-[12.5px]">
              {p.topic_weights.slice(0, 8).map((w) => (
                <li key={w.key} className="flex items-center gap-2">
                  <span className="w-28 truncate text-ink" title={w.name ?? w.key}>{w.name ?? w.key}</span>
                  <span className="h-1.5 flex-1 rounded bg-[#eef1f5]"><span className={`block h-1.5 rounded ${w.weight >= 0 ? "bg-brand" : "bg-rose-400"}`} style={{ width: `${Math.min(100, Math.abs(w.weight) * 100)}%` }} /></span>
                  <span className={`w-12 text-right tabular-nums ${w.weight >= 0 ? "text-ink-soft" : "text-rose-700"}`}>{w.weight.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">최근 신호 (서버 기록 · 파생 ignore 포함)</div>
          {recent.length === 0 ? <p className="text-xs text-ink-soft">기록된 신호 없음</p> : (
            <ul className="divide-y divide-line text-[12px]">
              {recent.map((s, i) => (
                <li key={i} className="flex items-center gap-2 py-1">
                  <span className="tabular-nums text-ink-soft">{fmtTime(s.created_at)}</span>
                  <Badge tone={SIGNAL_TONE[s.action] ?? "held"}>{s.action}</Badge>
                  <span className="min-w-0 flex-1 truncate text-ink" title={s.title ?? s.content_id}>{s.title ?? s.content_id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function InterestsEditor({ topics, selected, disabled, onSave }: { topics: EarTopic[]; selected: string[]; disabled: boolean; onSave: (ids: string[]) => Promise<void> }) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const current = draft ?? selected;
  const dirty = draft !== null && (draft.length !== selected.length || draft.some((id) => !selected.includes(id)));
  const toggle = (id: string) => setDraft((d) => { const base = d ?? selected; return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]; });
  return (
    <Panel title={`관심 주제 ${current.length}개 — 정규 후보의 범위`} right={<button className={btnCls("primary")} disabled={disabled || !dirty} onClick={() => void onSave(current)}>저장</button>}>
      {topics.length === 0 ? <p className="text-xs text-ink-soft">주제를 불러오지 못했다</p> : (
        <div className="flex flex-wrap gap-1.5">
          {topics.filter((t) => t.is_visible || current.includes(t.id)).map((t) => {
            const on = current.includes(t.id);
            return <button key={t.id} type="button" disabled={disabled} onClick={() => toggle(t.id)} className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`} title={`${t.parent_category} · 콘텐츠 ${t.content_count}`}>{t.name}</button>;
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-soft">저장하면 앱의 관심 주제 관리와 같은 전체 교체가 일어난다. 여기서 뺀 주제는 &quot;사용자가 직접 해제한 주제&quot;로 기록돼 탐험에서도 빠진다.</p>
    </Panel>
  );
}

function CareerEditor({ account, disabled, onSave }: { account: RecommendTestAccount | null; disabled: boolean; onSave: (b: CareerBody) => Promise<void> }) {
  // 초기값은 서버 값 — 부모가 key 로 다시 마운트하므로 여기서 동기화 효과가 필요 없다
  const [cat, setCat] = useState(account?.user.job_category ?? "");
  const [title, setTitle] = useState(account?.user.job_title ?? "");
  const [years, setYears] = useState(yearsLabel(account?.user.years_of_experience ?? null));
  return (
    <Panel title="커리어 — 메타 축 career_fit 입력" right={<button className={btnCls("primary")} disabled={disabled} onClick={() => void onSave({ job_category: cat.trim() || null, job_title: title.trim() || null, years_of_experience: years || null })}>저장</button>}>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-[11px] text-ink-soft">직군<input value={cat} onChange={(e) => setCat(e.target.value)} className="mt-0.5 w-full rounded border border-line bg-panel px-2 py-1 text-xs text-ink" placeholder="예: 개발" /></label>
        <label className="text-[11px] text-ink-soft">직무<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 w-full rounded border border-line bg-panel px-2 py-1 text-xs text-ink" placeholder="예: 백엔드" /></label>
        <label className="text-[11px] text-ink-soft">연차<select value={years} onChange={(e) => setYears(e.target.value)} className="mt-0.5 w-full rounded border border-line bg-panel px-2 py-1 text-xs text-ink"><option value="">미입력</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      </div>
    </Panel>
  );
}
const careerKey = (a: RecommendTestAccount | null) => a ? `${a.user.id}|${a.user.job_category ?? ""}|${a.user.job_title ?? ""}|${a.user.years_of_experience ?? ""}` : "none";
/** 서버는 연차 하한(숫자)을 저장하고 요청은 구간 라벨을 받는다(career-api) — 표시용 역환산 */
function yearsLabel(min: number | null): string {
  if (min === null) return "";
  if (min >= 7) return "7+";
  if (min >= 4) return "4-6";
  if (min >= 2) return "2-3";
  return "0-1";
}
