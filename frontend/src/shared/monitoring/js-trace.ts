import { secureStorage } from '@/shared/storage/secure-storage';

/**
 * **개발계 JS 트레이스** — 화면 전환·플레이어 여닫기·JS 예외를 저장소에 남긴다(2026-09-27 02:21). 플레이어를 여러 번
 * 여닫으면 굳는데, 네이티브 트레이스엔 "닫기 하나에 RNSScreen 셋이 동시에 unmount" 만 남았다 — JS 트리가 통째로
 * 내려간 모양이라 JS 쪽 마지막 발자국이 필요하다. 굳으면 앱을 죽여야 하므로 매 기록마다 저장하고, 다음 실행 때
 * 이전 실행분을 `[prev]` 로 앞에 붙여 설정 > 스택 라우트 줄에 보여 준다. 운영 앱에는 표시 줄이 없다(개발계 전용 행).
 */
const STORAGE_KEY = 'diag.js_trace';
const MAX_ENTRIES = 40;

let entries: string[] = [];
let previousRun = '';
let isLoaded = false;

const persist = () => {
  void secureStorage.set(STORAGE_KEY, JSON.stringify(entries)).catch(() => undefined);
};

/** 앱 시작 때 한 번 — 이전 실행분을 옮겨 두고 이번 실행 기록을 새로 시작한다 */
export const loadJsTrace = async (): Promise<void> => {
  if (isLoaded) return;
  isLoaded = true;
  try {
    const raw = await secureStorage.get(STORAGE_KEY);
    const previous = raw ? (JSON.parse(raw) as string[]) : [];
    previousRun = previous.join(' > ');
  } catch {
    previousRun = '';
  }
  entries = [];
  persist();
};

const stamp = (): string => {
  const d = new Date();
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

export const traceJs = (note: string): void => {
  entries.push(`${stamp()} ${note}`);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  persist();
};

export const getJsTrace = (): string =>
  `${previousRun ? `[prev] ${previousRun} > [now] ` : ''}${entries.join(' > ') || 'none'}`;

/**
 * 전역 JS 오류 훅 — 렌더 밖(핸들러·프로미스)의 예외도 남긴다. 기존 핸들러(Sentry·RN 기본)는 그대로 부른다
 */
export const installJsTraceErrorHook = (): void => {
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, f?: boolean) => void; setGlobalHandler: (h: (e: unknown, f?: boolean) => void) => void } }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    traceJs(`error${isFatal ? '(fatal)' : ''}: ${error instanceof Error ? error.message : String(error)}`);
    previous(error, isFatal);
  });
};
