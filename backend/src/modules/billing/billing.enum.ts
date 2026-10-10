/**
 * 그 요금제에 대해 이 사용자가 할 수 있는 일(`subscription-api.md` 4.1). **서버가 판정한다** —
 * 클라이언트는 티어 순서를 스스로 비교하지 않는다.
 */
export enum PlanAction {
  /** 유효한 구독이 없고 유료 요금제 → [구독하기] */
  PURCHASE = 'purchase',
  /** 현재 구독 중인 요금제 → "이용 중" */
  CURRENT = 'current',
  /** 현재보다 높은 티어 → [업그레이드](즉시 적용) */
  UPGRADE = 'upgrade',
  /** 현재보다 낮은 유료 티어 → [변경](다음 결제일부터) */
  DOWNGRADE = 'downgrade',
  /**
   * 자동 갱신이 켜진 유료 구독자의 무료 요금제 — 유료 → 무료는 해지다(2026-10-08, KAN-159).
   * 앱은 [{이름}로 변경]으로 스토어 구독 관리를 연다. 해지 API는 없다
   */
  CANCEL = 'cancel',
  /**
   * 해지 예약 중인 구독자의 무료 요금제(이미 해지했다), 그 플랫폼에서 살 수 없는 요금제, 다른 스토어 구독 중
   * → 버튼 없음
   */
  NONE = 'none',
}

/** 결제를 시작한 화면 — 전환 분석용(`subscription-api.md` 4.3) */
export enum PurchaseEntryPoint {
  PAYWALL = 'paywall',
  SETTINGS = 'settings',
  ONBOARDING = 'onboarding',
}
