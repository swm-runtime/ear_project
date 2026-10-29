import { UserMarket } from '@/modules/user/user.enum';

/** `created`로 남은 결제 의도의 보관 기간(domain.md 8.3) */
export const PURCHASE_INTENT_RETENTION_DAYS = 30;

/**
 * 만료 보정의 여유(`subscription-api.md` 4.2). 만료 시각이 이만큼 지났는데도 비종결 상태면 스토어 알림이
 * 유실된 것으로 보고 스토어에 직접 묻는다. 갱신 알림은 보통 만료 직전~직후에 오므로 그보다 넉넉히 둔다.
 */
export const RECONCILE_OVERDUE_MS = 60 * 60 * 1000;

/**
 * 만료 보정의 상한(`subscription-api.md` 4.2). 스토어에 **확인할 수 없는 채로**(조회 키 미구성·스토어가 모르는
 * 구독·조회 실패 지속) 만료 시각이 이만큼 지난 비종결 구독은 만료로 내린다 — 상한이 없으면 그런 행은 영영
 * 유료로 남는다.
 *
 * 7일인 이유: App Store는 실패한 알림을 1·12·24·48·72시간 뒤에 다시 보내고 그것으로 끝이다(합 약 6.5일).
 * 그 뒤에는 늦은 갱신 알림이 올 가능성이 없다. 유예 기간은 이미 `expires_at`에 들어 있어 여기에 더하지 않는다.
 */
export const RECONCILE_FORCE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 후기 참여 프로모션의 지급이 가리키는 **내부 캠페인 행**(domain.md 8.5 — KAN-279). 마이그레이션 `1792000000000`이 넣는다.
 * 사용자가 입력할 수 없어야 하므로 코드 입력은 `is_active`와 무관하게 이 코드를 없는 코드로 보고, 관리자 수정은 거부한다.
 */
export const REVIEW_REWARD_INVITE_CODE = 'REVIEW-REWARD';

/**
 * 후기 참여 지급의 표시 이름(`plan.grant.name` · 프로모션 `name` — `content-review-api.md` 4.7). 사용자 시장의 언어다.
 * `invite_codes`에 언어별 이름 칸이 없어 이 행만 코드 상수로 처리한다(domain.md 8.6). "후기 참여 프로모션"으로 두면 화면 문자열이
 * "프로모션 프로모션"이 된다
 */
export const REVIEW_REWARD_GRANT_NAME: Readonly<Record<UserMarket, string>> = {
  [UserMarket.KR]: '후기 참여',
  [UserMarket.GLOBAL]: 'Review',
};
