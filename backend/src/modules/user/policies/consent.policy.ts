import { CURRENT_CONSENT_VERSIONS_BY_MARKET } from '../user.constant';
import { ConsentType } from '../user.enum';
import { ConsentAudience, PendingConsent } from '../user.types';
import {
  ageConfirmationVersionFor,
  minAgeFor,
} from './age-confirmation.policy';

/**
 * 그 대상의 현행 버전 — 약관·처리방침은 시장별 상수, 연령 확인은 기준 연령을 담은 값(KAN-220).
 * 기록·낡은 버전 판정·가입 목록이 모두 이 한 곳을 본다.
 */
export function currentConsentVersionOf(
  audience: ConsentAudience,
  consentType: ConsentType,
): string | null {
  return consentType === ConsentType.AGE_CONFIRMATION
    ? ageConfirmationVersionFor(audience)
    : CURRENT_CONSENT_VERSIONS_BY_MARKET[audience.market][consentType];
}

/** 동의 항목 — 연령 확인이면 기준 연령을 싣는다(앱은 이 숫자를 문구에 끼운다) */
export function toConsentRequirement(
  audience: ConsentAudience,
  consentType: ConsentType,
  isRequired: boolean,
): PendingConsent {
  return {
    consentType,
    version: currentConsentVersionOf(audience, consentType),
    isRequired,
    ...(consentType === ConsentType.AGE_CONFIRMATION
      ? { minAge: minAgeFor(audience) }
      : {}),
  };
}
