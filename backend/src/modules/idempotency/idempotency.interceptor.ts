import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import {
  catchError,
  EMPTY,
  from,
  mergeMap,
  Observable,
  of,
  throwError,
} from 'rxjs';

import { AuthenticatedRequest } from '@/common/decorators/current-user.decorator';
import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { sha256Hex } from '@/common/utils/hash.util';

import {
  ANONYMOUS_OWNER_KEY,
  IDEMPOTENCY_KEY_HEADER,
  toUserOwnerKey,
} from './idempotency.constant';
import { IdempotencyService } from './idempotency.service';

/**
 * convention.md 5.5 / architecture.md 8.4 — `Idempotency-Key`가 필수인 엔드포인트에 붙인다.
 *
 * 같은 키의 재요청에는 핸들러를 실행하지 않고 저장된 첫 응답을 그대로 반환한다.
 * 새 error_code를 만들지 않는 이유: 코드를 추가하면 `common-error-handling.md` 6장을 함께
 * 갱신해야 하는데(architecture.md 7.5) 그 문서는 클라이언트 계약 소유다. 형식 오류는
 * `VALIDATION_FAILED`, 키 충돌은 `CONFLICT`로 내보낸다.
 *
 * TODO(계약 협의 후): **가입 응답은 본문을 저장하지 않도록 바꾼다.**
 * `/auth/sign-up` 응답에는 `refresh_token` 원문이 들어 있어 지금 구조에서는 그것이
 * `response_body`에 24시간 평문으로 남는다 — `domain.md` 3.3(원문 토큰 저장 금지)과
 * 12.3(탈퇴 시 즉시 파기)에 어긋난다. 스코프가 `anonymous`라 탈퇴 시 파기 대상에서도 빠진다.
 * 민감 응답은 중복 실행 차단만 하고 본문을 비우면 해결되지만, 그러면 재요청이 첫 응답과
 * 다른 토큰을 받게 되어 `auth-api.md`의 "저장된 첫 응답을 그대로 반환"과 달라진다.
 * 그 문서 담당자와 합의된 뒤에 반영한다.
 */
interface RoutedRequest {
  route?: { path?: string };
  path: string;
}

function resolveRoutePath(request: AuthenticatedRequest): string {
  const routed = request as unknown as RoutedRequest;
  return routed.route?.path ?? routed.path;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    const idempotencyKey = request.header(IDEMPOTENCY_KEY_HEADER)?.trim();
    if (!idempotencyKey) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_FAILED,
        message: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요',
      });
    }

    const outcome = await this.idempotencyService.begin(
      {
        // 가입은 계정이 생기기 전 호출이라 사용자 스코프가 없다 (domain.md 1.4)
        ownerKey: request.user
          ? toUserOwnerKey(request.user.id)
          : ANONYMOUS_OWNER_KEY,
        idempotencyKey,
        // 경로 파라미터가 있어도 같은 엔드포인트로 묶이도록 라우트 패턴을 쓴다
        endpoint: `${request.method} ${request.baseUrl}${resolveRoutePath(request)}`,
        requestHash: sha256Hex(JSON.stringify(request.body ?? {})),
      },
      new Date(),
    );

    if (outcome.type === 'replay') {
      // 저장한 원문을 직접 실어 보낸다 — 다시 직렬화하면 키 순서가 달라진다 (domain.md 1.4)
      response.status(outcome.status);

      if (outcome.body === null) {
        response.send();
      } else {
        response.type('application/json').send(outcome.body);
      }

      return EMPTY;
    }

    return next.handle().pipe(
      mergeMap((body: unknown) =>
        from(
          this.idempotencyService.complete(
            outcome.id,
            response.statusCode,
            body === undefined ? null : JSON.stringify(body),
          ),
        ).pipe(mergeMap(() => of(body))),
      ),
      catchError((error: unknown) =>
        from(this.idempotencyService.discard(outcome.id)).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }
}
