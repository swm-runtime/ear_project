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
export const STATUS_LABEL: Record<string, string> = {
  proposed: "후보", approved: "승인", claimed: "집기", drafted: "대본 완료", qa_passed: "QA 통과", packaged: "패키지", published: "발행",
  rejected: "반려", held: "보류", review_required: "사람 검토 필요", expired: "만료",
  queued: "대기", running: "실행 중", done: "완료", failed: "실패", cancelled: "취소",
  allow_open: "1군", allow_support: "2군", blocked: "차단", hold: "보류", candidate: "후보",
};
export const label = (s: string | null | undefined) => (s ? STATUS_LABEL[s] ?? s : "-");
