/**
 * 에피소드 진행 단계 계산 (에피소드 목록의 가로 트래커 — 2026-09-08).
 * 산출물 키·백로그 상태·작업(jobs) 이력만으로 7단계의 상태를 정하고, 막힌 단계가 있으면 "문제 + 다음 행동"을 하나로 뽑는다.
 * 순수 함수 — 서버 컴포넌트에서 쓴다. 판정은 표시일 뿐이며 상태 전이는 워커·사람 게이트가 한다.
 */
export type StageState = "done" | "running" | "failed" | "warn" | "pending" | "skip";
export interface Stage { key: string; label: string; state: StageState; note?: string }
export interface Problem { stage: string; text: string; href?: string; action?: string; tone: "failed" | "warn" | "info" }

type Verdicts = { flags?: Record<string, { verdict?: string } | undefined>; scores?: Record<string, { human?: string | null } | undefined> } | null;
export interface EpisodeRow {
  id: string; backlog_id: string; script_key: string | null; qa_report_key: string | null; critic_report_key: string | null;
  audio_dist_key: string | null; critic_verdicts: Verdicts; regression?: boolean | null;
}
export interface BacklogRow { id: string; status: string; published_content_ref: string | null }
export interface JobRow { type: string; status: string; attempt: number; error: string | null; result: { verdict?: string } | null; created_at: string; payload: { episode_id?: string; rubric?: string } | null }

const ACTIVE = new Set(["queued", "claimed", "running"]);
const AFTER_QA = new Set(["qa_passed", "packaged", "published"]);
const firstLine = (s: string | null | undefined) => (s ?? "").replace(/^Error:\s*/, "").split("\n")[0].slice(0, 110);

export function computeStages(ep: EpisodeRow, bl: BacklogRow | undefined, jobs: JobRow[]): { stages: Stage[]; problem: Problem | null } {
  const sorted = [...jobs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // 최신 먼저
  const latest = (t: string) => sorted.find((j) => j.type === t);
  const status = bl?.status ?? "";
  const stages: Stage[] = [];
  let problem: Problem | null = null;
  const setProblem = (p: Problem) => { if (!problem) problem = p; };
  const epHref = (tab?: string) => `/episodes/${ep.id}${tab ? `?tab=${tab}` : ""}`;

  // 1. 초안
  const dj = latest("draft");
  if (ep.script_key) stages.push({ key: "draft", label: "초안", state: "done", note: dj && dj.attempt > 1 ? `재생성 ${dj.attempt}회차` : undefined });
  else if (dj && ACTIVE.has(dj.status)) stages.push({ key: "draft", label: "초안", state: "running", note: dj.attempt > 1 ? `재생성 ${dj.attempt}회차 진행 중` : "생성 중" });
  else if (dj?.status === "failed") { stages.push({ key: "draft", label: "초안", state: "failed", note: firstLine(dj.error) }); setProblem({ stage: "초안", text: firstLine(dj.error), tone: "failed", href: "/jobs", action: "작업 기록" }); }
  else stages.push({ key: "draft", label: "초안", state: "pending" });

  // 2. QA — 통과 여부는 백로그 상태가 기준, 회차는 qa 작업 수
  const qaJobs = sorted.filter((j) => j.type === "qa");
  const qaDone = qaJobs.filter((j) => j.status === "done").length;
  const qj = qaJobs[0];
  if (AFTER_QA.has(status)) stages.push({ key: "qa", label: "QA", state: "done", note: qaDone > 1 ? `${qaDone}회차 통과` : "1회차 통과" });
  else if (status === "review_required") { stages.push({ key: "qa", label: "QA", state: "failed", note: "3회 실패 — 사람 검토" }); setProblem({ stage: "QA", text: "3회차까지 실패 — 사람이 QA 리포트를 보고 수정·재QA 또는 반려", tone: "failed", href: epHref("qa"), action: "QA 리포트" }); }
  else if (qj && ACTIVE.has(qj.status)) stages.push({ key: "qa", label: "QA", state: "running", note: `${qj.attempt}회차 검사 중` });
  else if (qj?.status === "done" && qj.result?.verdict && qj.result.verdict !== "qa_passed" && dj && ACTIVE.has(dj.status)) stages.push({ key: "qa", label: "QA", state: "running", note: `${qj.attempt}회차 실패 → 재생성 중` });
  else if (qj?.status === "failed") { stages.push({ key: "qa", label: "QA", state: "failed", note: firstLine(qj.error) }); setProblem({ stage: "QA", text: firstLine(qj.error), tone: "failed", href: "/jobs", action: "작업 기록" }); }
  else stages.push({ key: "qa", label: "QA", state: ep.script_key ? "pending" : "skip", note: ep.script_key ? "대기" : undefined });

  // 3. 비평
  const cj = latest("critic");
  if (ep.critic_report_key) stages.push({ key: "critic", label: "비평", state: "done", note: cj?.payload?.rubric === "v2" ? "v2" : undefined });
  else if (cj && ACTIVE.has(cj.status)) stages.push({ key: "critic", label: "비평", state: "running", note: "채점 중" });
  else if (cj?.status === "failed") { stages.push({ key: "critic", label: "비평", state: "failed", note: firstLine(cj.error) }); setProblem({ stage: "비평", text: firstLine(cj.error), tone: "failed", href: "/jobs", action: "작업 기록" }); }
  else stages.push({ key: "critic", label: "비평", state: AFTER_QA.has(status) ? "pending" : "skip" });

  // 4. 판정 (사람)
  const v = ep.critic_verdicts;
  const judged = !!v && (Object.values(v.flags ?? {}).some((x) => x?.verdict) || Object.values(v.scores ?? {}).some((x) => x?.human !== "" && x?.human != null));
  if (judged) stages.push({ key: "judge", label: "판정", state: "done" });
  else if (ep.critic_report_key) { stages.push({ key: "judge", label: "판정", state: "pending", note: "판정 대기" }); setProblem({ stage: "판정", text: "비평 리포트가 나왔고 사람 판정을 기다린다", tone: "info", href: epHref("script"), action: "판정하기" }); }
  else stages.push({ key: "judge", label: "판정", state: "skip" });

  // 5. TTS (수동 트리거)
  const tj = latest("tts");
  if (ep.audio_dist_key) stages.push({ key: "tts", label: "TTS", state: "done" });
  else if (tj && ACTIVE.has(tj.status)) stages.push({ key: "tts", label: "TTS", state: "running", note: "합성 중" });
  else if (tj?.status === "failed") {
    const e = firstLine(tj.error); const pron = /정규화 후 잔존|발음/.test(tj.error ?? "");
    stages.push({ key: "tts", label: "TTS", state: "failed", note: e });
    setProblem({ stage: "TTS", text: e, tone: "failed", href: epHref(pron ? "pron" : "audio"), action: pron ? "발음 탭에서 추가 후 재요청" : "오디오 탭" });
  }
  else stages.push({ key: "tts", label: "TTS", state: AFTER_QA.has(status) ? "pending" : "skip", note: AFTER_QA.has(status) ? "수동 요청" : undefined });

  // 6. 패키지
  const pj = latest("package");
  if (status === "packaged" || status === "published") stages.push({ key: "package", label: "패키지", state: "done" });
  else if (pj && ACTIVE.has(pj.status)) stages.push({ key: "package", label: "패키지", state: "running" });
  else if (pj?.status === "failed") { stages.push({ key: "package", label: "패키지", state: "failed", note: firstLine(pj.error) }); setProblem({ stage: "패키지", text: firstLine(pj.error), tone: "failed", href: epHref("meta"), action: "메타 탭" }); }
  else stages.push({ key: "package", label: "패키지", state: ep.audio_dist_key ? "pending" : "skip" });

  // 7. 발행 (게이트 2 — 사람)
  if (status === "published") {
    if (bl?.published_content_ref) stages.push({ key: "publish", label: "발행", state: "done" });
    else { stages.push({ key: "publish", label: "발행", state: "warn", note: "제품 id 미연결" }); setProblem({ stage: "발행", text: "발행됐지만 제품 콘텐츠 id가 기록되지 않아 재발행 버튼이 뜨지 않는다", tone: "warn", href: "/publish", action: "발행 기록 연결" }); }
  }
  else if (status === "packaged") { stages.push({ key: "publish", label: "발행", state: "pending", note: "게이트 2 대기" }); setProblem({ stage: "발행", text: "패키지 완료 — 검수 후 제품 발행", tone: "info", href: `/publish/upload?episode=${ep.id}`, action: "제품 발행" }); }
  else stages.push({ key: "publish", label: "발행", state: "skip" });

  // 막힌 곳이 없으면 진행 중인 단계를 안내
  if (!problem) {
    const running = stages.find((s) => s.state === "running");
    if (running) problem = { stage: running.label, text: running.note ?? "진행 중", tone: "info", href: epHref(), action: "상세" };
  }
  return { stages, problem };
}
