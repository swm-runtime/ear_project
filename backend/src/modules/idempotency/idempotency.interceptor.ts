import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
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
 * **토큰 원문이 실리는 응답에는 붙이지 않는다** — `/auth/sign-up`이 그 예다(auth-api.md 4.2,
 * 개정 2026-09-08). 본문을 저장하면 `refresh_token`이 `response_body`에 24시간 평문으로 남아
 * `domain.md` 3.3(원문 토큰 저장 금지)에 어긋난다. 그 라우트의 중복 방지는 `users` 유니크와
 * 기존 계정 재사용이 맡는다.
 */
interface RoutedRequest {
  route?: { path?: string };
  path: string;
}

function resolveRoutePath(request: AuthenticatedRequest): string {
  const routed = request as unknown as RoutedRequest;
  return routed.route?.path ?? routed.path;
}

/**
 * 이 요청이 **성공했을 때 나갈 상태 코드**.
 *
 * `response.statusCode`를 읽지 않는다 — 인터셉터가 도는 시점에 Nest가 라우트의 코드를
 * 이미 적용했는지가 프레임워크 내부 순서에 달려 있어, 버전이 바뀌면 조용히 200으로
 * 굳는다. 재요청이 첫 응답과 **다른 상태 코드**를 받으면 클라이언트가 다른 분기를 탄다
 * (`domain.md` 1.4 — 저장된 첫 응답을 그대로 반환한다).
 *
 * `@HttpCode()`가 선언돼 있으면 그 값, 없으면 메서드 기본값(POST는 201)이다.
 */
function resolveStatusCode(
  context: ExecutionContext,
  request: AuthenticatedRequest,
): number {
  const declared = Reflect.getMetadata(
    HTTP_CODE_METADATA,
    context.getHandler(),
  ) as number | undefined;

  if (typeof declared === 'number') {
    return declared;
  }

  return request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK;
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
            resolveStatusCode(context, request),
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
