/** `GET /app/version` 200 — settings-api.md 4.6(4.1 의 `version` 블록과 같은 형태) */
export interface AppVersionResponseDto {
  latest_version: string;
  min_supported_version: string;
  update_available: boolean;
}

/**
 * 관문 판정 결과 — 화면·스토어는 이 셋으로만 분기한다.
 * - `ok` 통과. `updateAvailable` 이면 권장 안내(닫기 가능)
 * - `required` 강제 업데이트(426). 이후 로직 진행 안 함. 426 의 `details`(최소·최신 버전)는 화면이 쓰지 않아 싣지 않는다
 *   (`ApiError` 가 details 를 옮기지 않는다 — 필요해지면 api-client 부터)
 * - `unknown` 판정 불가(망·5xx·타임아웃) — 캐시도 없다. 막지 않는다(fail-open)
 */
export type VersionGateVerdict =
  | { kind: 'ok'; updateAvailable: boolean; latestVersion: string }
  | { kind: 'required' }
  | { kind: 'unknown' };
