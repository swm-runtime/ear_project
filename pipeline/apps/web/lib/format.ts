export function fmtTime(s: string | null | undefined): string {
  if (!s) return "-";
  const d = new Date(s);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
export function ago(s: string | null | undefined): string {
  if (!s) return "-";
  const sec = Math.max(0, (Date.now() - new Date(s).getTime()) / 1000);
  if (sec < 90) return `${Math.round(sec)}초 전`;
  if (sec < 5400) return `${Math.round(sec / 60)}분 전`;
  if (sec < 172800) return `${Math.round(sec / 3600)}시간 전`;
  return `${Math.round(sec / 86400)}일 전`;
}
/** 소요 시간 — 끝났으면 start→finish, 진행 중이면 start→heartbeat(현재까지). 초/분 단위 사람 읽기. */
export function fmtDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "-";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.max(0, (e - s) / 1000);
  if (sec < 60) return `${Math.round(sec)}초`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}분${end ? "" : "+"}`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분${end ? "" : "+"}`;
}
const kfmt = (n: number) => (n < 1000 ? String(n) : n < 10000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`);
/** runs.tokens 요약 — LLM 은 usage(input/output/cache), TTS 는 {characters}. 표 한 칸에 들어갈 짧은 문자열. */
export function fmtTokens(t: any): string {
  if (!t || typeof t !== "object") return "-";
  if (typeof t.characters === "number") return `${t.characters.toLocaleString("ko-KR")}자`;
  const inTok = (t.input_tokens ?? 0) + (t.cache_read_input_tokens ?? 0) + (t.cache_creation_input_tokens ?? 0);
  const out = t.output_tokens ?? 0;
  if (!inTok && !out) return "-";
  return `in ${kfmt(inTok)}·out ${kfmt(out)}`;
}
export const fmtUsd = (n: number | null | undefined) => (n == null ? "-" : `$${Number(n).toFixed(Number(n) < 1 ? 3 : 2)}`);

export const STATUS_LABEL: Record<string, string> = {
  proposed: "후보", approved: "승인", claimed: "집기", drafted: "대본 완료", qa_passed: "QA 통과", packaged: "패키지", published: "발행",
  rejected: "반려", held: "보류", review_required: "사람 검토 필요", expired: "만료",
  queued: "대기", running: "실행 중", done: "완료", failed: "실패", cancelled: "취소",
  allow_open: "1군", allow_support: "2군", blocked: "차단", hold: "보류", candidate: "후보",
};
export const label = (s: string | null | undefined) => (s ? STATUS_LABEL[s] ?? s : "-");
