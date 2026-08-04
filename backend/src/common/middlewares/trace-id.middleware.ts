import { randomUUID } from 'node:crypto';

import { NextFunction, Request, Response } from 'express';

export const TRACE_ID_HEADER = 'X-Trace-Id';

export interface TracedRequest extends Request {
  traceId: string;
}

/**
 * architecture.md 7.4 — trace_id는 요청 단위로 생성해 응답 헤더와 모든 로그에 남긴다.
 *
 * 클라이언트가 보낸 헤더를 신뢰하지 않고 서버가 직접 발급한다.
 * Guard에서 발생한 예외도 trace_id를 갖도록 인터셉터가 아니라 미들웨어에 둔다.
 */
export function traceIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const traceId = randomUUID();

  (req as TracedRequest).traceId = traceId;
  res.setHeader(TRACE_ID_HEADER, traceId);

  next();
}

export function getTraceId(req: Request): string | null {
  return (req as Partial<TracedRequest>).traceId ?? null;
}
