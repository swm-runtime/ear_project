/**
 * 알림 도메인 타입 — OS 권한 상태는 기기만 아는 값이라 이 feature가 원 정의를 소유한다
 * (settings-api.md 3장 설계 메모 — 서버 사본은 실제 권한과 어긋날 수 있다).
 */
export type OsPermissionStatus = 'granted' | 'denied' | 'undetermined';

/** 푸시가 가리키는 목적지(notification.md 3장 `deep_link`) */
export type PushTarget = { kind: 'library' } | { kind: 'content'; contentId: string };

/** 드립 도착 통지 한 건 — 푸시 `data`에서 읽은 값 */
export interface PushArrival {
  target: PushTarget;
  /** 도착한 편수(정규 + 탐험). 못 읽었으면 null — 배너가 숫자 없는 문구를 쓴다 */
  contentCount: number | null;
}
