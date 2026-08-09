/**
 * 알림 도메인 타입 — OS 권한 상태는 기기만 아는 값이라 이 feature가 원 정의를 소유한다
 * (settings-api.md 3장 설계 메모 — 서버 사본은 실제 권한과 어긋날 수 있다).
 */
export type OsPermissionStatus = 'granted' | 'denied' | 'undetermined';
