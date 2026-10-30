import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { ContentLengthProfile } from './content.enum';

/**
 * 도입부 버전(`contents.intro_version`, KAN-298 범위 추가 — 2026-10-29) 형식. 값의 이름은 파이프라인이 정한다(예 `hook-v2`).
 * 서버는 길이(≤ 32)와 안전한 문자(소문자·숫자로 시작, 소문자·숫자·`.`·`_`·`-`)만 본다. 같은 식이 마이그레이션의 CHECK
 * `ck_contents_intro_version`에도 있다 — 바꾸려면 둘을 함께 바꾼다
 */
export const INTRO_VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/;

/**
 * 짧은 판의 원본 연결 규칙(KAN-298) — 콘텐츠 업로드(`variant_of_content_id`)와 시리즈 만들기(`variant_of_series_id`)가 같은
 * 규칙을 쓴다. 400 `VALIDATION_FAILED`이고 `details.field`가 칸 이름이다(`admin-api.md` 4.6의 다른 필드 오류와 같은 표기).
 *
 * - `standard`는 원본을 가질 수 없다 — 원본이 있다는 것은 그것이 짧은 판이라는 뜻이다.
 * - `short`는 원본이 필요하다 — 단 짧은 시리즈의 편은 원본 시리즈의 같은 화가 없을 수 있어 호출부가 `originRequired`로 푼다.
 * - 원본은 존재해야 하고 **`standard`여야 한다**(변형의 변형 없음 — 원본 ↔ 짧은 판이 1단계 짝이라야 비교가 된다).
 */
export type VariantField = 'variant_of_content_id' | 'variant_of_series_id';

export function assertVariantPairing(input: {
  lengthProfile: ContentLengthProfile;
  variantOfId: string | null;
  field: VariantField;
  originRequired: boolean;
}): void {
  if (
    input.lengthProfile === ContentLengthProfile.STANDARD &&
    input.variantOfId !== null
  ) {
    throw variantValidationFailed(
      input.field,
      '원본은 짧은 판(length_profile: short)만 가질 수 있어요',
    );
  }
  if (
    input.lengthProfile === ContentLengthProfile.SHORT &&
    input.variantOfId === null &&
    input.originRequired
  ) {
    throw variantValidationFailed(input.field, '짧은 판은 원본 id가 필요해요');
  }
}

/** 원본 행을 읽은 뒤의 판정 — 없으면, 또는 원본이 이미 짧은 판이면 400 */
export function assertVariantOrigin(
  origin: { lengthProfile: ContentLengthProfile } | null,
  field: VariantField,
): void {
  if (!origin) {
    throw variantValidationFailed(field, '원본을 찾을 수 없어요');
  }
  if (origin.lengthProfile !== ContentLengthProfile.STANDARD) {
    throw variantValidationFailed(
      field,
      '원본이 이미 짧은 판이에요 — 기존 편(standard)을 원본으로 지정해 주세요',
    );
  }
}

export function variantValidationFailed(
  field: string,
  message: string,
): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.VALIDATION_FAILED,
    message,
    details: { field },
  });
}
