/**
 * 판정 입력의 안전망 (2026-09-07 — 배포 순간 저장 요청이 끊겨 "저장 중…"에 갇히고 15:29 이후 입력을 잃은 사고).
 * 1) 저장 요청 타임아웃 — 응답이 없으면 실패로 돌려 버튼을 살린다.
 * 2) 브라우저 로컬 초안 — 입력이 바뀔 때마다 localStorage 에 두고, 새로고침·배포 후 마운트 때 서버 저장본보다 새로우면 복원한다.
 * 서버 저장이 성공하면 초안을 지운다. 클라이언트 컴포넌트에서만 부른다 (localStorage).
 */
export const SAVE_TIMEOUT_MS = 15_000;

export function withTimeout<T>(p: Promise<T>, ms = SAVE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`저장 응답이 없습니다 (${Math.round(ms / 1000)}초) — 배포·네트워크 확인 후 [지금 저장]으로 다시 시도하세요. 입력은 이 브라우저에 보관돼 있습니다`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export interface Draft<T> { at: string; data: T }

export const draftKey = (kind: "judge" | "verdict", episodeId: string) => `judge-draft:${kind}:${episodeId}`;

export function loadDraft<T>(key: string): Draft<T> | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Draft<T>) : null; } catch { return null; }
}
export function saveDraft<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), data } satisfies Draft<T>)); } catch { /* 저장 공간·프라이빗 모드 — 안전망만 잃는다 */ }
}
export function clearDraft(key: string): void {
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
}
/** 서버 저장본(judged_at)보다 초안이 새로우면 복원 대상 */
export const draftIsNewer = (d: Draft<unknown> | null, judgedAt: string | null | undefined): d is Draft<unknown> => !!d && (!judgedAt || d.at > judgedAt);
export const fmtDraftTime = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
/** 현재 화면의 키에 있는 항목만 받아들인다 — 리포트가 바뀌어 항목이 달라졌으면 남는 초안은 버린다 */
export function pickKnown<T>(cur: Record<string, T>, draft: Record<string, T> | undefined): Record<string, T> {
  if (!draft) return cur;
  return Object.fromEntries(Object.keys(cur).map((k) => [k, draft[k] ?? cur[k]]));
}
