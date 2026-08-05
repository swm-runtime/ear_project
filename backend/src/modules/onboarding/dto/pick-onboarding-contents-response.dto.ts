import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { PickResult } from '../onboarding.types';

class PickFailureDto {
  readonly content_id: string;
  readonly error_code: ErrorCode;
}

/**
 * onboarding-api.md 4.6 — **부분 실패를 200으로 표현한다.**
 *
 * 생성된 리소스 하나를 가리키는 응답이 아니라 건별 결과 요약이라 201이 아니라 200이다.
 * 유니크 위반("이미 담김")은 실패가 아니라 `saved_content_ids`에 포함된다 —
 * 재시도한 사용자에게 실패로 보이면 안 된다.
 */
export class PickOnboardingContentsResponseDto {
  readonly saved_content_ids: string[];
  readonly failed: PickFailureDto[];
  readonly picked_count: number;

  static from(result: PickResult): PickOnboardingContentsResponseDto {
    return {
      saved_content_ids: result.savedContentIds,
      failed: result.failed.map((failure) => ({
        content_id: failure.contentId,
        error_code: failure.errorCode,
      })),
      picked_count: result.pickedCount,
    };
  }
}
