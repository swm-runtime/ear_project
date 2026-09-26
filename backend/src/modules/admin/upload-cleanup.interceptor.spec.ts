import { CallHandler, ExecutionContext } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { lastValueFrom, of, throwError } from 'rxjs';

import { UploadCleanupInterceptor } from './upload-cleanup.interceptor';

jest.mock('node:fs/promises', () => ({
  rm: jest.fn().mockResolvedValue(undefined),
}));

function buildContext(files: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ files }) }),
  } as unknown as ExecutionContext;
}

describe('UploadCleanupInterceptor — 파이프·핸들러가 던져도 임시 파일을 지운다', () => {
  const rmMock = rm as jest.MockedFunction<typeof rm>;

  beforeEach(() => {
    rmMock.mockClear();
  });

  it('핸들러 앞(파이프)에서 400이 나면 올라온 파일을 전부 지우고 오류는 그대로 전파한다', async () => {
    const interceptor = new UploadCleanupInterceptor();
    const next: CallHandler = {
      handle: () => throwError(() => new Error('validation failed')),
    };
    const files = {
      audio: [{ path: '/tmp/a.mp3' }],
      thumbnail: [{ path: '/tmp/t.webp' }],
    };

    await expect(
      lastValueFrom(interceptor.intercept(buildContext(files), next)),
    ).rejects.toThrow('validation failed');

    expect(rmMock).toHaveBeenCalledTimes(2);
    expect(rmMock).toHaveBeenCalledWith('/tmp/a.mp3', { force: true });
    expect(rmMock).toHaveBeenCalledWith('/tmp/t.webp', { force: true });
  });

  it('성공 경로에서는 건드리지 않는다 — 핸들러의 finally 가 지운다', async () => {
    const interceptor = new UploadCleanupInterceptor();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          buildContext({ audio: [{ path: '/tmp/a.mp3' }] }),
          next,
        ),
      ),
    ).resolves.toEqual({ ok: true });

    expect(rmMock).not.toHaveBeenCalled();
  });

  it('파일이 없는 요청에서 던져도 그대로 전파한다', async () => {
    const interceptor = new UploadCleanupInterceptor();
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(buildContext(undefined), next)),
    ).rejects.toThrow('boom');
    expect(rmMock).not.toHaveBeenCalled();
  });
});
