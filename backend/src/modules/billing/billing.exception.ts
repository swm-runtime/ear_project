import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

/**
 * 구독·결제 경로가 공통으로 던지는 예외(`subscription-api.md` 5장). App Store·Play 두 경로가 같은 코드·같은
 * 문구로 답해야 해서 한곳에 둔다.
 */

/** 없는·비활성·무료 요금제, 그 플랫폼의 상품 ID 없음, 또는 서버에 그 스토어의 검증 구성이 없음 */
export function planUnavailable(): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
    message: '지금은 이 요금제를 구독할 수 없어요',
    logLevel: 'info',
  });
}

/**
 * 서명·번들·환경 불일치, 모르는 상품, 만료·환불된 거래. **사유는 응답에 싣지 않는다** — 위조 시도에 무엇이
 * 틀렸는지 알려 주지 않는다. 호출부가 로그에 남긴다.
 */
export function receiptInvalid(): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
    message: '구독을 확인할 수 없어요',
    logLevel: 'info',
  });
}

/** 스토어 확인의 일시 실패 — 클라이언트는 거래를 끝내지 않고 재시도한다 */
export function storeUnavailable(): BusinessException {
  return new BusinessException({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    errorCode: ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
    message: '구독을 확인하고 있어요. 잠시 후 자동으로 반영됩니다',
    retryable: true,
  });
}
