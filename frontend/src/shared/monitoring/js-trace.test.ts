import { afterEach, describe, expect, it, jest } from '@jest/globals';

afterEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

const setup = (isDev: boolean) => {
  jest.resetModules();
  const storage = {
    get: jest.fn<() => Promise<string | null>>().mockResolvedValue('["이전 실행"]'),
    set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  jest.doMock('@/shared/lib/app-version', () => ({ IS_DEV_API: isDev }));
  jest.doMock('@/shared/storage/secure-storage', () => ({ secureStorage: storage }));
  const trace = jest.requireActual<typeof import('./js-trace')>('./js-trace');
  return { storage, trace };
};

describe('JS 진단 트레이스 환경 경계', () => {
  it.each([false, true])('개발계 %s에서 오류 훅의 등록과 기존 핸들러 호출을 지킨다', (isDev) => {
    type Handler = (error: unknown, isFatal?: boolean) => void;
    const globals = globalThis as typeof globalThis & {
      ErrorUtils?: { getGlobalHandler: () => Handler; setGlobalHandler: (handler: Handler) => void };
    };
    const original = globals.ErrorUtils;
    const previous = jest.fn<Handler>();
    const setHandler = jest.fn<(handler: Handler) => void>();
    globals.ErrorUtils = { getGlobalHandler: () => previous, setGlobalHandler: setHandler };
    try {
      const { trace } = setup(isDev);
      trace.installJsTraceErrorHook();
      if (isDev) {
        expect(setHandler).toHaveBeenCalledTimes(1);
        const error = new Error('렌더 외 오류');
        setHandler.mock.calls[0][0](error, true);
        expect(previous).toHaveBeenCalledWith(error, true);
        expect(trace.getJsTrace()).toContain('error(fatal): 렌더 외 오류');
      } else {
        expect(setHandler).not.toHaveBeenCalled();
      }
    } finally {
      if (original) globals.ErrorUtils = original;
      else delete globals.ErrorUtils;
    }
  });

  it('운영에서는 저장소를 읽거나 쓰지 않고 기록을 만들지 않는다', async () => {
    const { storage, trace } = setup(false);
    await trace.loadJsTrace();
    trace.traceJs('player.mount');
    trace.installJsTraceErrorHook();
    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
    expect(trace.getJsTrace()).toBe('none');
  });

  it('개발계에서는 이전 실행을 보존하고 새 기록을 저장한다', async () => {
    const { storage, trace } = setup(true);
    await trace.loadJsTrace();
    await trace.loadJsTrace();
    trace.traceJs('player.mount');
    expect(storage.get).toHaveBeenCalledTimes(1);
    expect(storage.set).toHaveBeenCalledTimes(2);
    expect(trace.getJsTrace()).toContain('[prev] 이전 실행 > [now]');
    expect(trace.getJsTrace()).toContain('player.mount');
  });
});
