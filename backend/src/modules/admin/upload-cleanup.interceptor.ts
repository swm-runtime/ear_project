import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { rm } from 'node:fs/promises';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

/**
 * 멀티파트 임시 파일을 **실패 경로에서도** 지운다(2026-09-26 감사).
 *
 * Nest 실행 순서는 가드 → 인터셉터 → 파이프 → 핸들러다. `FileFieldsInterceptor`가 파일을 `/tmp`에 다 쓴 뒤
 * `ValidationPipe`·`ParseUUIDPipe`가 400을 던지면 핸들러의 `try/finally`(`discardUploads`)에 닿지 않아 최대
 * 200MB가 요청마다 남았다. 이 인터셉터는 `FileFieldsInterceptor` **뒤에** 걸려 파이프·핸들러를 감싸므로,
 * 어디서 던지든 `request.files`를 지운다. 성공 경로는 핸들러가 이미 지우고, 없는 파일은 무시하므로 겹쳐도 무해하다.
 */
@Injectable()
export class UploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { files?: unknown }>();

    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          from(removeUploadedFiles(request.files)).pipe(
            mergeMap(() => throwError(() => error)),
          ),
        ),
      );
  }
}

/** multer의 `files`는 필드명 → 파일 배열(`FileFieldsInterceptor`) 또는 배열이다 — 둘 다 받는다 */
export async function removeUploadedFiles(files: unknown): Promise<void> {
  const list: unknown[] = Array.isArray(files)
    ? files
    : files && typeof files === 'object'
      ? Object.values(files as Record<string, unknown>).flat()
      : [];
  const paths = list
    .map((file) => (file as { path?: unknown } | null)?.path)
    .filter((path): path is string => typeof path === 'string');

  await Promise.all(paths.map((path) => rm(path, { force: true })));
}
