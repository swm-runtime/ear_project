/** 편성 배치가 넘기는 사용자 한 명의 그날 적립분 */
export interface DripArrival {
  userId: string;
  /** 정규 편(`library_items.source = drip`) — 적립 순서 */
  regular: ArrivedContent[];
  /** 탐험 편(`source = discovery`, `drip-scheduling.md` 4.8) */
  discovery: ArrivedContent[];
}

export interface ArrivedContent {
  contentId: string;
  title: string;
}

export interface DripArrivalNotifySummary {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  invalidatedDeviceCount: number;
}

/** 기기 한 대로 가는 메시지 */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * 메시지 한 건의 접수 결과. `id`는 receipt 조회 키이고, 실제로 보내지 않는 구현(`log`)은 null 이다.
 * `error`는 Expo `details.error`(예: `DeviceNotRegistered`) — 요청 자체가 실패했으면 null 이다.
 */
export type PushTicket =
  | { status: 'ok'; id: string | null }
  | { status: 'error'; error: string | null; message: string };

/** 발송 후 조회하는 최종 전달 결과 */
export type PushReceipt =
  { status: 'ok' } | { status: 'error'; error: string | null; message: string };
