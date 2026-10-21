import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

/**
 * 가입 때 고른 언어로 표시 언어를 맞춘다(PM 2026-10-19 — `locale.ts` `adoptSignupLanguage`). 모듈이 시작 순간에
 * 기기 로캘·저장된 선택을 읽으므로, 테스트마다 기기 로캘·저장값을 정한 뒤 모듈을 새로 불러온다.
 */
// jest.setup.js 가 표시 언어를 'ko' 로 고정한 가짜 모듈을 끼운다 — 여기서는 진짜 모듈의 언어 전환을 본다
jest.unmock('@/shared/i18n/locale');

type LocaleModule = typeof import('./locale');
type LocalizedModule = typeof import('./localized');

const mockGetItem = jest.fn<(key: string) => string | null>();
const mockSetItem = jest.fn<(key: string, value: string) => void>();
const mockReloadAsync = jest.fn<() => Promise<void>>();

const loadWith = (
  deviceLocale: string,
  stored: string | null,
): { locale: LocaleModule; localized: LocalizedModule['localized'] } => {
  mockGetItem.mockReturnValue(stored);
  mockReloadAsync.mockResolvedValue(undefined);
  jest
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockReturnValue({ locale: deviceLocale, timeZone: 'America/New_York' } as never);
  let locale!: LocaleModule;
  let localized!: LocalizedModule['localized'];
  jest.isolateModules(() => {
    jest.doMock('expo-secure-store', () => ({ getItem: mockGetItem, setItem: mockSetItem }));
    jest.doMock('expo-updates', () => ({ reloadAsync: mockReloadAsync }));
    locale = jest.requireActual<LocaleModule>('./locale');
    localized = jest.requireActual<LocalizedModule>('./localized').localized;
  });
  return { locale, localized };
};

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

const ko = { title: '약관 동의', nested: { next: '다음' }, count: (n: number) => `${n}개` };
const en = { title: 'Terms', nested: { next: 'Continue' }, count: (n: number) => `${n} items` };

describe('adoptSignupLanguage — 가입 때(A21) 고른 언어로 표시 언어를 맞춘다', () => {
  it('영어 표시에서 한국어를 고르면 표시 언어가 ko 가 되고 설정과 같은 자리에 저장된다 — 다시 부르지 않는다', () => {
    // given — 영어 기기, 설정에서 고른 적 없음(기기 언어 따르기)
    const { locale } = loadWith('en-US', null);
    expect(locale.APP_LANGUAGE).toBe('en');

    // when
    locale.adoptSignupLanguage('ko');

    // then
    expect(locale.APP_LANGUAGE).toBe('ko');
    expect(locale.DISPLAY_LOCALE).toBe('ko-KR');
    expect(mockSetItem).toHaveBeenCalledWith('ear.displayLanguage', 'ko');
    expect(mockReloadAsync).not.toHaveBeenCalled();
  });

  it('한국어 표시에서 English 를 고르면 en 이 된다', () => {
    // given
    const { locale } = loadWith('ko-KR', null);
    expect(locale.APP_LANGUAGE).toBe('ko');

    // when
    locale.adoptSignupLanguage('en');

    // then
    expect(locale.APP_LANGUAGE).toBe('en');
    expect(locale.DISPLAY_LOCALE).toBe('en-US');
    expect(mockSetItem).toHaveBeenCalledWith('ear.displayLanguage', 'en');
    expect(mockReloadAsync).not.toHaveBeenCalled();
  });

  it('지금 표시 언어와 같은 언어면 아무것도 바꾸지 않는다 — "기기 언어 따르기"가 그대로다', () => {
    // given
    const { locale } = loadWith('en-GB', null);

    // when
    locale.adoptSignupLanguage('en');

    // then
    expect(locale.APP_LANGUAGE).toBe('en');
    expect(locale.DISPLAY_LOCALE).toBe('en-GB');
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('저장한 선택은 다음 실행에도 표시 언어가 된다', () => {
    // given — 영어 기기에서 가입 때 한국어를 골라 'ko' 가 저장된 뒤 다시 켬
    const { locale } = loadWith('en-US', 'ko');

    // then
    expect(locale.APP_LANGUAGE).toBe('ko');
    expect(locale.DISPLAY_LOCALE).toBe('ko-KR');
  });
});

describe('localized — 언어를 주지 않으면 읽는 순간의 표시 언어로 풀린다', () => {
  it('바뀌기 전에 만든 카피(하위 객체·함수 포함)도 바뀐 뒤에는 새 언어로 읽힌다', () => {
    // given — 카피 모듈은 시작 때 평가된다
    const { locale, localized } = loadWith('en-US', null);
    const copy = localized({ ko, en });
    const nested = copy.nested;
    expect(copy.title).toBe('Terms');

    // when
    locale.adoptSignupLanguage('ko');

    // then
    expect(copy.title).toBe('약관 동의');
    expect(nested.next).toBe('다음');
    expect(copy.count(3)).toBe('3개');
    expect(copy.nested).toBe(nested);
    expect(Object.keys(copy)).toEqual(['title', 'nested', 'count']);
  });

  it('언어를 바꾸지 않으면 시작 때 언어 그대로다(종전 동작)', () => {
    const { localized } = loadWith('ko-KR', null);
    const copy = localized({ ko, en });
    expect(copy.title).toBe('약관 동의');
    expect(copy).toEqual({ ...ko, nested: { next: '다음' }, count: copy.count });
  });
});

describe('요청 헤더 — Accept-Language 가 바뀐 표시 언어를 따른다', () => {
  it('영어 기기에서 한국어를 고른 뒤의 요청은 ko-KR', async () => {
    // given
    const { locale } = loadWith('en-US', null);
    let apiClient!: typeof import('@/shared/api/api-client').apiClient;
    jest.isolateModules(() => {
      jest.doMock('@/shared/i18n/locale', () => locale);
      apiClient =
        jest.requireActual<typeof import('@/shared/api/api-client')>(
          '@/shared/api/api-client',
        ).apiClient;
    });
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => ({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    apiClient.defaults.adapter = adapter as never;

    // when
    locale.adoptSignupLanguage('ko');
    await apiClient.get('/ping');

    // then
    expect(AxiosHeaders.from(adapter.mock.calls[0][0].headers).get('Accept-Language')).toBe(
      'ko-KR',
    );
  });
});
