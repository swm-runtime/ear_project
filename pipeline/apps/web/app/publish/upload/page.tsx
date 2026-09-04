"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { setBacklogStatus, listPublishableEpisodes } from "../../actions";
import { EarTopic, listEarTopics, uploadEarContent } from "@/lib/ear";
import { Badge, PageHeader, Panel, btnCls } from "@/components/ui";
import { EarGate, EarSession, earErrMsg } from "../ear-connect";

interface UploadMeta {
  episode_id: string; backlog_id: string; title: string; description: string;
  major_topic: string | null; mid_topic: string; duration_min_estimate: number | null;
  sources: { publisher: string; title: string; url: string }[];
  artifacts: { audio_dist: string | null };
}

/**
 * 제품 업로드 (admin.md 4.2 — 업로드 = 즉시 발행).
 * `?episode=<id>` 로 들어오면 패키지 산출물(upload-meta.json·dist.mp3)을 프리필한다 —
 * 게이트 2(spec/07 3장)의 제목·설명 확정과 검수 체크가 이 화면에서 함께 이뤄진다.
 */
export default function UploadPage() {
  return (
    <Suspense>
      <UploadPageInner />
    </Suspense>
  );
}

function UploadPageInner() {
  const episodeId = useSearchParams().get("episode");
  return (
    <div className="space-y-3">
      <PageHeader title={episodeId ? `제품 발행 — ${episodeId}` : "제품 수동 업로드"}
        breadcrumb={["파이프라인", "제품 발행", "업로드"]}
        desc="업로드하면 즉시 전체 사용자에게 발행돼요(중간 상태 없음). 잘못 올렸으면 목록에서 회수."
        actions={<EarSession />} />
      <EarGate><UploadForm episodeId={episodeId} /></EarGate>
    </div>
  );
}

function UploadForm({ episodeId }: { episodeId: string | null }) {
  const router = useRouter();
  const [meta, setMeta] = useState<UploadMeta | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [topics, setTopics] = useState<EarTopic[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sources, setSources] = useState<{ title: string; author: string; url: string }[]>([]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [checks, setChecks] = useState([false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [pending, setPending] = useState<{ id: string; title: string; mid_topic: string; status: string; created_at: string }[] | null>(null);

  // 발행 대기 목록 — episode 미지정일 때만 (오디오 완료·미발행). 고르면 ?episode=<id> 로 이동해 프리필된다.
  useEffect(() => {
    if (episodeId) { setPending(null); return; }
    void listPublishableEpisodes().then(setPending).catch(() => setPending([]));
  }, [episodeId]);

  // 프리필 — 패키지 메타 + 제품 주제 목록
  useEffect(() => {
    void (async () => {
      try {
        setTopics((await listEarTopics()).items);
        if (episodeId) {
          const res = await fetch(`/api/publish/${episodeId}`);
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);
          const body = (await res.json()) as { meta: UploadMeta; has_audio: boolean };
          setMeta(body.meta); setHasAudio(body.has_audio);
          setTitle(body.meta.title ?? "");
          setDescription(body.meta.description ?? "");
          setSources((body.meta.sources ?? []).map((s) => ({ title: s.title, author: s.publisher, url: s.url })));
          setSourceName(`참고한 자료: ${[...new Set((body.meta.sources ?? []).map((s) => s.publisher))].join(", ")}`);
        }
      } catch (e) { setLoadErr(earErrMsg(e)); }
    })();
  }, [episodeId]);

  const canSubmit = useMemo(() =>
    title.trim() && description.trim() && sourceName.trim() && topicIds.length > 0 &&
    sources.some((s) => s.title.trim()) && checks.every(Boolean) && thumbFile &&
    (audioFile || (episodeId && hasAudio)),
  [title, description, sourceName, topicIds, sources, checks, thumbFile, audioFile, episodeId, hasAudio]);

  const submit = useCallback(async () => {
    setBusy(true); setMsg(null);
    try {
      let audio = audioFile;
      if (!audio && episodeId) {
        const res = await fetch(`/api/publish/${episodeId}?audio=1`);
        if (!res.ok) throw new Error("발행 오디오(dist.mp3)를 읽지 못했어요");
        audio = new File([await res.blob()], `${episodeId}.mp3`, { type: "audio/mpeg" });
      }
      const content = await uploadEarContent({
        title: title.trim(), description: description.trim(), origin: "ai_generated",
        source_name: sourceName.trim(), topic_ids: topicIds,
        sources: sources.filter((s) => s.title.trim()).map((s) => ({
          title: s.title.trim(), ...(s.author.trim() ? { author: s.author.trim() } : {}), ...(s.url.trim() ? { url: s.url.trim() } : {}),
        })),
        review_confirmed: true,
      }, audio!, thumbFile!);
      if (meta) await setBacklogStatus(meta.backlog_id, "published").catch(() => undefined); // 파이프라인 상태 반영 — 실패해도 발행은 성립
      setMsg({ kind: "ok", text: `발행되었습니다 — ${content.id}` });
      setTimeout(() => router.push("/publish"), 900);
    } catch (e) {
      const anyE = e as { field?: string };
      setMsg({ kind: "bad", text: `${earErrMsg(e)}${anyE.field ? ` (필드: ${anyE.field})` : ""}` });
    } finally { setBusy(false); }
  }, [audioFile, episodeId, title, description, sourceName, topicIds, sources, thumbFile, meta, router]);

  if (loadErr) return <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{loadErr}</p>;

  const CHECKLIST = [
    "사실·출처 — claims 표본을 발췌와 대조했다 (게이트 2 #1)",
    "소스 적법 — 전 소스 계층 판정 완료, 차단 도메인 없음 (#2)",
    "오디오 — 청취 확인(오독·무음·시작/끝 출처 고지 멘트) (#3·spec/06 8장)",
    "제목·설명 — 내용과 일치, 과장 없음 (#5)",
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {episodeId && <Link href="/publish/upload" className="inline-block text-xs text-ink-soft underline hover:text-ink">← 발행 대기 목록</Link>}
        {!episodeId && (
          <Panel title="발행 대기 — 오디오 완료 · 미발행">
            {pending === null ? (
              <p className="text-[13px] text-ink-soft">불러오는 중…</p>
            ) : pending.length === 0 ? (
              <p className="text-[13px] text-ink-soft">발행 대기 중인(오디오 생성 완료·미발행) 에피소드가 없어요. 아래에서 파일을 직접 올려도 됩니다.</p>
            ) : (
              <div className="divide-y divide-line">
                {pending.map((e) => (
                  <button key={e.id} onClick={() => router.push(`/publish/upload?episode=${e.id}`)}
                    className="flex w-full items-center gap-3 rounded px-1 py-2 text-left text-[13px] hover:bg-[#f7f9fb]">
                    <span className="font-medium text-ink">{e.title}</span>
                    <span className="text-[11px] text-ink-soft">{e.mid_topic}</span>
                    <span className="ml-auto font-mono text-[11px] text-ink-soft">{e.id}</span>
                    <Badge tone={e.status === "packaged" ? "done" : undefined}>{e.status === "packaged" ? "발행 준비" : "패키지 먼저"}</Badge>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink-soft">고르면 그 에피소드의 dist.mp3·메타가 자동으로 채워져요. 목록에 없으면 아래에서 파일을 직접 올리면 됩니다.</p>
          </Panel>
        )}
        <Panel title="발행 메타">
          <div className="space-y-3 text-[13px]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">제목 *</span>
              <input className="w-full rounded border border-line px-3 py-2" value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">설명 *</span>
              <textarea className="min-h-24 w-full rounded border border-line px-3 py-2" value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">출처 고지 표기 (source_name) *</span>
              <input className="w-full rounded border border-line px-3 py-2" value={sourceName} maxLength={100} onChange={(e) => setSourceName(e.target.value)} />
            </label>
          </div>
        </Panel>
        <Panel title="참고 소스 (상세 화면 전수 나열 — 입력 순서 = 표시 순서)" right={
          <button className={btnCls()} onClick={() => setSources((s) => [...s, { title: "", author: "", url: "" }])}>+ 소스</button>
        }>
          <div className="space-y-2 text-[13px]">
            {sources.map((s, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_2fr_auto] gap-2">
                <input className="rounded border border-line px-2 py-1.5" placeholder="제목 *" value={s.title} onChange={(e) => setSources((arr) => arr.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <input className="rounded border border-line px-2 py-1.5" placeholder="발행처/저자" value={s.author} onChange={(e) => setSources((arr) => arr.map((x, j) => j === i ? { ...x, author: e.target.value } : x))} />
                <input className="rounded border border-line px-2 py-1.5" placeholder="https://" value={s.url} onChange={(e) => setSources((arr) => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                <button className={btnCls("danger")} onClick={() => setSources((arr) => arr.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {sources.length === 0 && <p className="text-ink-soft">소스를 1개 이상 추가하세요 (AI 생성 콘텐츠 필수).</p>}
          </div>
        </Panel>
        <Panel title="파일">
          <div className="grid gap-3 text-[13px] sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">오디오 (mp3/m4a) {episodeId && hasAudio ? "— 패키지 dist.mp3 사용" : "*"}</span>
              <input type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4" onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} />
              {episodeId && hasAudio && !audioFile && <p className="mt-1 text-[11px] text-ink-soft">비워두면 에피소드의 발행본(dist.mp3)을 그대로 올려요.</p>}
              {episodeId && !hasAudio && <p className="mt-1 text-[11px] text-amber-700">이 에피소드에 dist.mp3 가 없어요 — TTS 먼저, 또는 파일 직접 선택.</p>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">썸네일 (jpg/png/webp, ≤5MB) *</span>
              <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="제품 주제 * (1개 이상)">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {topics.map((t) => {
              const on = topicIds.includes(t.id);
              return (
                <button key={t.id}
                  className={`rounded-full border px-2.5 py-1 transition ${on ? "border-brand bg-brand text-white" : `border-line bg-white text-ink hover:bg-[#f7f9fb] ${t.is_visible ? "" : "border-dashed text-ink-soft"}`}`}
                  onClick={() => setTopicIds((ids) => on ? ids.filter((x) => x !== t.id) : [...ids, t.id])}>
                  {t.name}{!t.is_visible && " (숨김)"}
                </button>
              );
            })}
            {topics.length === 0 && <p className="text-ink-soft">제품 주제가 없어요 — <a className="text-brand underline" href="/publish/topics">제품 주제 관리</a>에서 먼저 생성.</p>}
          </div>
        </Panel>
        <Panel title="게이트 2 검수 * (admin.md 4.2-1)">
          <div className="space-y-2 text-[13px]">
            {CHECKLIST.map((c, i) => (
              <label key={i} className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={checks[i]} onChange={(e) => setChecks((arr) => arr.map((x, j) => j === i ? e.target.checked : x))} />
                <span>{c}</span>
              </label>
            ))}
            <p className="text-[11px] text-ink-soft">확인 기록은 제품 감사 로그(audit_logs)에 남아요. 미체크 업로드는 서버가 거부해요.</p>
          </div>
        </Panel>
        {meta && (
          <Panel title="파이프라인 연동">
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {meta.mid_topic} · 예상 {meta.duration_min_estimate ?? "?"}분 · 백로그 {meta.backlog_id}<br />
              발행 성공 시 백로그 상태를 <b>published</b>로 바꿔요.
            </p>
          </Panel>
        )}
        <button className={`${btnCls("primary", "md")} w-full justify-center`} disabled={!canSubmit || busy} onClick={() => void submit()}>
          {busy ? "업로드 중… (창을 닫지 마세요)" : "업로드 — 즉시 발행"}
        </button>
        {msg && <p className={`rounded-md border p-3 text-[13px] ${msg.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
