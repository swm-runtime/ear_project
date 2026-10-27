/**
 * 알림 도메인 타입 — OS 권한 상태는 기기만 아는 값이라 이 feature가 원 정의를 소유한다
 * (settings-api.md 3장 설계 메모 — 서버 사본은 실제 권한과 어긋날 수 있다).
 */
export type OsPermissionStatus = 'granted' | 'denied' | 'undetermined';

/** 푸시가 가리키는 목적지(notification.md 3장 `deep_link`) */
export type PushTarget =
  { kind: 'library' } | { kind: 'profile' } | { kind: 'content'; contentId: string };

/** 우리 알림의 종류(notification.md 3장 `type`) — 드립 도착(4.3) · 저녁 리텐션(4.6) */
export type PushType = 'drip_arrival' | 'retention';

/** 우리 알림 한 건 — 푸시 `data`에서 읽은 값 */
export interface PushMessage {
  type: PushType;
  target: PushTarget;
  /** 드립 도착의 편수(정규 + 탐험). 못 읽었거나 리텐션이면 null. 탭 배지는 갱신한 목록 응답으로 센다. */
  contentCount: number | null;
  /** 리텐션의 `<규칙>.<변형>`(예: `weekly_rank_gap.b`) — 문구 변형별 반응률 비교용. 드립이면 null */
  rule: string | null;
}
