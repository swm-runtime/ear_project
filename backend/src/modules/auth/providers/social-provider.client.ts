import { HttpStatus, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { SocialProvider } from '@/modules/user/user.enum';

import { PROVIDER_REQUEST_TIMEOUT_MS } from '../auth.constant';
import { SocialProfile } from '../auth.types';

/** `Response.status`는 number이므로 비교 대상도 number로 고정한다 */
const UNAUTHORIZED_STATUS: number = HttpStatus.UNAUTHORIZED;
const FORBIDDEN_STATUS: number = HttpStatus.FORBIDDEN;

/**
 * 소셜 제공자 경계 (architecture.md 9.1).
 *
 * 클라이언트가 보낸 프로필을 신뢰하지 않고 **서버가 제공자 API로 검증**한다.
 * 제공자 오류는 여기서 도메인 예외로 변환하고 원본 에러는 로그에만 남긴다(7.3).
 */
export abstract class SocialProviderClient {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly provider: SocialProvider;

  abstract fetchProfile(providerToken: string): Promise<SocialProfile>;

  protected async requestProvider(
    url: string,
    providerToken: string,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${providerToken}` },
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        'social provider request failed',
        error instanceof Error ? error.stack : undefined,
        { provider: this.provider },
      );
      throw this.providerUnavailable();
    }

    if (
      response.status === UNAUTHORIZED_STATUS ||
      response.status === FORBIDDEN_STATUS
    ) {
      throw this.tokenInvalid();
    }

    if (!response.ok) {
      this.logger.error('social provider responded with error', undefined, {
        provider: this.provider,
        status: response.status,
      });
      throw this.providerUnavailable();
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw this.providerUnavailable();
    }
  }

  protected tokenInvalid(): BusinessException {
    return new BusinessException({
      status: HttpStatus.UNAUTHORIZED,
      errorCode: ErrorCode.AUTH_PROVIDER_TOKEN_INVALID,
      message: '로그인에 실패했어요. 다시 시도해주세요',
    });
  }

  protected providerUnavailable(): BusinessException {
    return new BusinessException({
      status: HttpStatus.BAD_GATEWAY,
      errorCode: ErrorCode.AUTH_PROVIDER_UNAVAILABLE,
      message: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요',
      retryable: true,
      logLevel: 'error',
    });
  }
}
