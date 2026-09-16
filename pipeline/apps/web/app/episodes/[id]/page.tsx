import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { parseCriticReport, parseCriticScores, parseScript, readArtifact } from "@/lib/artifacts";
import { fmtTime, fmtTokens, fmtUsd, label, jobRoundLabel } from "@/lib/format";
import { JudgeView } from "./judge-view";
import { VerdictForm } from "./verdict-form";
import { TtsButton } from "./tts-button";
import { RepublishButton } from "./republish-button";
import { ThumbnailButton } from "./thumbnail-button";
import { PublishPrepButton } from "./publish-prep-button";
import { AnchorButton } from "./anchor-button";
import { OneLinerEditor } from "./one-liner-editor";
import { DeleteButton } from "./delete-button";
import { listObjects, presignGet } from "@/lib/storage";
import { ScriptEditor } from "./script-editor";
import { PronEditor } from "./pron-editor";
import { AutoRefresh } from "@/components/auto-refresh";
import { JobProgress } from "@/components/job-progress";
import { Badge, LinkBtn, PageHeader, Panel } from "@/components/ui";

const TABS = [["script", "대본"], ["outline", "구성안"], ["sources", "발췌"], ["claims", "claims"], ["qa", "QA"], ["critic", "비평·판정"], ["pron", "발음"], ["audio", "오디오"], ["thumb", "썸네일"], ["meta", "메타"], ["runs", "실행 기록"]] as const;

export default async function EpisodePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params; const { tab = "script" } = await searchParams;
  const sb = await supabaseServer();
  const { data: ep } = await sb.from("episodes").select("*").eq("id", id).single();
  if (!ep) notFound();
  const [{ data: bl }, { data: runs }, { data: jobs }] = await Promise.all([
    sb.from("backlog").select("id,title,mid_topic,status,angle,published_content_ref,published_version,published_at").eq("id", ep.backlog_id).single(),
    sb.from("runs").select("phase,attempt,result,model,executed_by,executed_at,prompt_version,cost_usd,tokens,worker_rev").eq("backlog_id", ep.backlog_id).order("executed_at"),
    sb.from("jobs").select("id,type,status,attempt,payload,progress,claimed_by,created_at").eq("payload->>episode_id", id).order("created_at"),
  ]);
  const keyOf: Record<string, string | null> = { script: ep.script_key, sources: ep.sources_key, claims: ep.claims_key, qa: ep.qa_report_key, critic: ep.critic_report_key };
  // 구성안·대본 노트(2단계 초안, spec/04 8장) — DB 키 없이 script_key 와 같은 디렉토리에서 찾는다 (구 방식 에피소드는 없음)
  const outlineKey = ep.script_key ? ep.script_key.replace(/script\.md$/, "outline.md") : null;
  const notesKey = ep.script_key ? ep.script_key.replace(/script\.md$/, "script-notes.md") : null;
  const content = tab in keyOf ? await readArtifact(keyOf[tab]) : tab === "outline" ? await readArtifact(outlineKey) : null;
  const scriptNotes = tab === "outline" ? await readArtifact(notesKey) : null;
  const criticMd = tab === "script" ? await readArtifact(ep.critic_report_key) : null; // 대본 탭에서 리포트를 대본 위에 얹어 판정한다
  const ttsJob = (jobs ?? []).find((j) => j.type === "tts" && ["queued", "claimed", "running"].includes(j.status));
  const pkgJob = (jobs ?? []).find((j) => j.type === "package" && ["queued", "claimed", "running"].includes(j.status));
  const thumbJob = (jobs ?? []).find((j) => j.type === "thumbnail" && ["queued", "claimed", "running"].includes(j.status));
  const audioFiles = tab === "audio" ? await listAudioFiles(ep.id) : null;
  const thumbUrl = tab === "thumb" && ep.thumbnail_key ? await presignGet(String(ep.thumbnail_key).replace(/^s3:/, ""), 3600).catch(() => null) : null;
  const anchorOf = tab === "thumb" ? (await sb.from("settings").select("value").eq("key", "thumbnail.anchor").maybeSingle()).data?.value as { episode_id?: string } | null : null;
  const uploadMeta = tab === "meta" ? await readUploadMeta(ep.id) : null; // 패키지 산출물 (spec/07 2장) — 게이트 2 검수 항목 5(제목·설명)의 근거
  const pronRaw = tab === "pron" ? await readPronunciations(ep.id) : null; // 에피소드 발음 맵 (spec/06 6장) — TTS 병합 사전의 에피소드 층
  const activeJobs = (jobs ?? []).filter((j) => ["queued", "claimed", "running"].includes(j.status));
  // 발행 준비 3단계의 진행 표시(티켓 5번) — 산출물이 있으면 ✓, 큐/실행 중이면 진행 중
  const prepPending = !!ttsJob || !!thumbJob || !!pkgJob;
  const prepSteps: [string, boolean, boolean][] = [
    ["TTS", !!ep.audio_dist_key, !!ttsJob],
    ["썸네일", !!ep.thumbnail_key, !!thumbJob],
    ["패키지", ["packaged", "published"].includes(bl?.status ?? ""), !!pkgJob],
  ];
  // 재발행 (spec/07 5장): 발행된 에피소드의 오디오가 발행 이후에 다시 합성됐으면 버튼 — 자동 푸시 없음, 사람이 청취 확인 후 누른다
  const lastTtsAt = (runs ?? []).filter((r) => r.phase === "tts" && !/샘플/.test(r.result ?? "")).map((r) => r.executed_at as string).sort().at(-1) ?? null;
  const audioNewer = !!(bl?.published_at && lastTtsAt && lastTtsAt > bl.published_at);
  // 썸네일도 같은 규칙(KAN-50 5-1) — 건너뛴 실행은 새로 만든 것이 아니므로 제외한다
  const lastThumbAt = (runs ?? []).filter((r) => r.phase === "thumbnail" && !/건너뜀/.test(r.result ?? "")).map((r) => r.executed_at as string).sort().at(-1) ?? null;
  const thumbnailNewer = !!(bl?.published_at && lastThumbAt && lastThumbAt > bl.published_at);

  return (
    <div className="space-y-4">
      {activeJobs.length > 0 && <AutoRefresh seconds={8} />}
      <PageHeader
        title={bl?.title ?? ep.id}
        breadcrumb={["파이프라인", "에피소드", ep.id]}
        desc={bl?.angle ?? undefined}
        actions={<>
          <Badge value={bl?.status} />
          {ep.regression && <Badge tone="held">{ep.regression_kind === "planted" ? "회귀 세트 · 심은 오류본 (정답은 설명란)" : ep.regression_kind === "anchor_low" ? "회귀 세트 · 저품질 앵커" : "회귀 세트"}</Badge>}
          <span className="text-xs text-ink-soft">{bl?.mid_topic} · {ep.prompt_version}</span>
          {/* 상단은 [발행 준비] 하나다 — 개별 재실행은 각 산출물 탭에 있다(KAN-50 1번) */}
          <PublishPrepButton episodeId={ep.id} backlogId={ep.backlog_id} enabled={["qa_passed", "packaged", "published"].includes(bl?.status ?? "")} pending={prepPending} />
          {["packaged", "published"].includes(bl?.status ?? "") && <LinkBtn kind="primary" href={`/publish/upload?episode=${ep.id}`}>제품 발행</LinkBtn>}
          <DeleteButton episodeId={ep.id} backlogId={ep.backlog_id} disabled={!!ep.regression || bl?.status === "published" || activeJobs.some((j) => j.status !== "queued")}
            disabledReason={ep.regression ? "회귀 세트는 지울 수 없음" : bl?.status === "published" ? "발행된 에피소드 — 제품 발행에서 회수가 먼저" : "진행 중인 작업이 끝난 뒤"} />
          {bl?.status === "published" && bl.published_content_ref && (
            <RepublishButton episodeId={ep.id} backlogId={ep.backlog_id} contentId={bl.published_content_ref} version={bl.published_version ?? null} publishedAt={bl.published_at ?? null} lastTtsAt={lastTtsAt} lastThumbAt={lastThumbAt} audioNewer={audioNewer} thumbnailNewer={thumbnailNewer} pending={prepPending} />
          )}
        </>}
      />
      {activeJobs.map((j) => (
        <div key={j.id} className="rounded-md border border-line bg-panel px-4 py-3">
          <div className="text-[13px] font-medium">{j.type}{jobRoundLabel(j)} {j.status === "queued" ? "— AI 워커 대기 중" : "실행 중"} <span className="font-normal text-ink-soft">{j.claimed_by ?? ""}</span></div>
          <JobProgress job={j} />
        </div>
      ))}
      {prepPending && (
        <div className="rounded-md border border-line bg-panel px-4 py-2 text-[13px]">
          {prepSteps.map(([name, done, running], i) => (
            <span key={name}>
              {i > 0 && <span className="mx-2 text-ink-soft">·</span>}
              <span className={running ? "font-semibold text-brand-ink" : done ? "text-ink" : "text-ink-soft"}>
                {name} {running ? "진행 중" : done ? "✓" : "대기"}
              </span>
            </span>
          ))}
        </div>
      )}
      <nav className="flex gap-1 border-b border-line text-[13px]">
        {TABS.map(([k, name]) => (
          <Link key={k} href={`?tab=${k}`} className={`-mb-px border-b-2 px-3 py-2 transition ${tab === k ? "border-brand font-semibold text-brand-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {name}{k in keyOf && k !== "script" && !keyOf[k] ? <span className="ml-1 text-[10px] text-ink-soft">없음</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "runs" && (
        <Panel flush>
          <div className="divide-y divide-line text-[13px]">
            {(runs ?? []).map((r, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="done">{r.phase}{r.attempt > 1 ? ` #${r.attempt}` : ""}</Badge>
                  <span className="text-[11px] text-ink-soft">{fmtTime(r.executed_at)} · {r.model ?? "-"} · {fmtTokens(r.tokens)}{r.cost_usd != null ? ` · ${fmtUsd(r.cost_usd)}` : ""} · {r.executed_by} · {r.prompt_version}{r.worker_rev ? ` · ${r.worker_rev}` : ""}</span>
                </div>
                <p className="mt-1 leading-relaxed text-ink-soft">{r.result}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {tab === "outline" && content == null && <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">구성안이 없습니다 — 2단계 초안(설계→대본)으로 만든 에피소드에만 있습니다.</p>}
      {tab !== "runs" && tab !== "audio" && tab !== "meta" && tab !== "pron" && tab !== "outline" && content == null && <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">아직 산출물이 없습니다{keyOf[tab] ? ` (키: ${keyOf[tab]} — 서버에서 읽을 수 없음. s3: 키면 PIPELINE_BUCKET·AWS 자격증명(인스턴스 역할 / 로컬 AWS_PROFILE), local: 키면 WORK_ROOT 확인)` : ""}.</p>}
      {tab === "script" && content && (criticMd
        ? (() => { const parsed = parseCriticReport(criticMd); const sc = parseCriticScores(criticMd); return <JudgeView episodeId={ep.id} backlogId={ep.backlog_id} turns={parseScript(content)} flags={parsed.flags} stars={parsed.stars} scores={sc.rows} total={sc.total} saved={ep.critic_verdicts} edits={ep.human_edits ?? []} />; })()
        : <ScriptEditor episodeId={ep.id} backlogId={ep.backlog_id} turns={parseScript(content)} edits={ep.human_edits ?? []} editable />)}
      {(tab === "sources" || tab === "claims" || tab === "qa") && content && <Panel className="min-w-0"><pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{content}</pre></Panel>}
      {tab === "outline" && content && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="구성안 — outline.md (대본 단계의 계약)" className="min-w-0"><pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{content}</pre></Panel>
          <Panel title="대본 노트 — 새 연결·비유 · 자기 점검 · 턴별 claims" className="min-w-0"><pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{scriptNotes ?? "(없음)"}</pre></Panel>
        </div>
      )}
      {tab === "audio" && (
        audioFiles?.length ? (
          <Panel title="오디오 — 청취 확인 (spec/06 8장) · 서명 URL 1시간(만료 시 새로고침)" className="text-[13px]">
            <div className="mb-4">
              <TtsButton episodeId={ep.id} backlogId={ep.backlog_id} enabled={["qa_passed", "packaged", "published"].includes(bl?.status ?? "")} pending={!!ttsJob} />
            </div>
            <div className="space-y-4">
              {audioFiles.map((f) => (
                <div key={f.name}>
                  <div className="mb-1 font-medium">
                    {f.name} <span className="font-normal text-ink-soft">{f.mb}MB</span>
                    {f.name === "sample.mp3" && <span className="ml-2 text-[11px] text-amber-700">청취 확인용 샘플 — 발행 경로 아님</span>}
                  </div>
                  {f.mp3 ? <audio controls preload="none" src={f.url} className="w-full" /> : <a className="text-brand underline" href={f.url}>내려받기 (무손실 마스터)</a>}
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">
            {audioFiles ? "아직 오디오가 없습니다 — 상단 [발행 준비]로 생성합니다 (qa_passed 이후)." : "오디오 목록을 읽을 수 없습니다 (서버 S3 설정 확인)."}
          </p>
        )
      )}
      {tab === "thumb" && (
        thumbUrl ? (
          <Panel title="썸네일 — 시인성 확인 (KAN-50) · 서명 URL 1시간(만료 시 새로고침)" className="text-[13px]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <ThumbnailButton episodeId={ep.id} backlogId={ep.backlog_id} enabled={["qa_passed", "packaged", "published"].includes(bl?.status ?? "")} pending={!!thumbJob} exists={!!ep.thumbnail_key} />
              <AnchorButton episodeId={ep.id} isCurrent={anchorOf?.episode_id === ep.id} />
            </div>
            {/* 1024 원본과 44pt 축소본을 나란히 둔다 — 앱에서 가장 작게 쓰이는 크기가 미니 플레이어(44pt)라,
                그 크기에서 무엇인지 알아볼 수 있는지가 채택 판정의 기준이다 (프롬프트 자산 [시인성]) */}
            <div className="flex flex-wrap items-start gap-6">
              <div>
                <div className="mb-1 text-ink-soft">원본 1024×1024</div>
                <img src={thumbUrl} alt="썸네일 원본" width={320} height={320}
                  className="rounded-xl border border-line" style={{ width: 320, height: 320 }} />
              </div>
              <div>
                <div className="mb-1 text-ink-soft">미니 플레이어 44pt</div>
                <img src={thumbUrl} alt="썸네일 44pt" width={44} height={44}
                  className="rounded border border-line" style={{ width: 44, height: 44 }} />
                <div className="mt-3 text-ink-soft">목록 72pt</div>
                <img src={thumbUrl} alt="썸네일 72pt" width={72} height={72}
                  className="mt-1 rounded-md border border-line" style={{ width: 72, height: 72 }} />
                <div className="mt-3 text-ink-soft">탐색 타일 156pt</div>
                <img src={thumbUrl} alt="썸네일 156pt" width={156} height={156}
                  className="mt-1 rounded-lg border border-line" style={{ width: 156, height: 156 }} />
              </div>
            </div>
            <p className="mt-4 text-ink-soft">
              44pt에서 무엇인지 알아볼 수 없거나 화풍이 편마다 튀면 상단 [썸네일 다시 만들기]로 다시 뽑는다 —
              마음에 드는 1장을 스타일 앵커(<code>THUMBNAIL_ANCHOR_KEY</code>)로 지정하면 이후 생성이 그 화풍을 따라간다.
            </p>
          </Panel>
        ) : (
          <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">
            {ep.thumbnail_key ? "썸네일 URL 을 만들지 못했습니다 (서버 S3 설정 확인)." : "아직 썸네일이 없습니다 — 상단 [발행 준비]로 만듭니다 (qa_passed 이후)."}
          </p>
        )
      )}
      {tab === "pron" && <PronEditor episodeId={ep.id} initial={pronRaw} />}
      {tab === "meta" && (
        uploadMeta ? (
          <Panel title="upload-meta.json — 패키지 산출물 (제목·설명은 초안, 확정은 게이트 2 검수자)" className="min-w-0">
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{uploadMeta}</pre>
          </Panel>
        ) : (
          <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">아직 패키지 전입니다 — 상단 [발행 준비]로 생성합니다 (qa_passed 이후).</p>
        )
      )}
      {tab === "script" && <OneLinerEditor episodeId={ep.id} initial={(ep.one_liner as string) ?? null} />}
      {tab === "critic" && content && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Panel className="min-w-0" title="비평 리포트 (AI 스냅샷 — 수정하지 않음)"><pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink">{content}</pre></Panel>
          <VerdictForm episodeId={ep.id} parsed={parseCriticReport(content)} saved={ep.critic_verdicts} />
        </div>
      )}
    </div>
  );
}

async function listAudioFiles(id: string) {
  try {
    const objs = await listObjects(`episodes/${id}/audio/`);
    return await Promise.all(
      objs.filter((o) => /\.(mp3|wav)$/.test(o.key) && !o.key.includes("/.tmp")).map(async (o) => ({
        name: o.key.split("/").pop()!,
        mb: (o.size / 1048576).toFixed(1),
        mp3: o.key.endsWith(".mp3"),
        url: await presignGet(o.key, 3600),
      })),
    );
  } catch (e) {
    console.error(`[audio] 목록 실패: ${(e as Error)?.message}`);
    return null;
  }
}

async function readPronunciations(id: string): Promise<string | null> {
  try {
    const { getText } = await import("@/lib/storage");
    const raw = await getText(`episodes/${id}/pronunciations.json`);
    return raw ? JSON.stringify(JSON.parse(raw), null, 2) : null;
  } catch (e) {
    console.error(`[pron] 읽기 실패: ${(e as Error)?.message}`);
    return null;
  }
}

async function readUploadMeta(id: string): Promise<string | null> {
  try {
    const { getText } = await import("@/lib/storage");
    const raw = await getText(`episodes/${id}/upload-meta.json`);
    return raw ? JSON.stringify(JSON.parse(raw), null, 2) : null;
  } catch (e) {
    console.error(`[meta] 읽기 실패: ${(e as Error)?.message}`);
    return null;
  }
}
