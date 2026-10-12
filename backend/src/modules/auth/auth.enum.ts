/**
 * domain.md 3.3 `sessions.revoked_reason` — 세션이 **왜** 폐기됐는가.
 *
 * 갱신(`AuthService.refresh`)이 폐기된 토큰을 받았을 때 탈취 판정의 근거다. 계약은 "**이미 회전된**
 * 토큰의 재제출 = 탈취 의심"(auth-api.md 4.3 · architecture.md 9.1)이고, 로그아웃처럼 회전 아닌
 * 폐기까지 같이 묶으면 로그아웃 직후의 자동 갱신 한 번이 다른 기기를 전부 로그아웃시킨다(KAN-167).
 *
 * 컬럼 도입(2026-10-10) 전에 폐기된 행은 NULL이다 — 사유를 모르므로 종전처럼 회전으로 본다.
 * 회원 탈퇴는 폐기가 아니라 행 삭제(users FK CASCADE)라 사유가 없다.
 */
export enum SessionRevokedReason {
  /** 갱신으로 회전됨 — 이 토큰의 재제출은 탈취 의심(REUSED) */
  ROTATED = 'rotated',
  /** 그 기기의 로그아웃 */
  LOGOUT = 'logout',
  /** 회전된 토큰의 재사용이 감지돼 사용자 세션 전체를 끊음 */
  REUSE_DETECTED = 'reuse_detected',
}
