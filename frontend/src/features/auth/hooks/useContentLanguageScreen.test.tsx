import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import { AUTH_COPY } from '../auth.copy';
import type { Market, RequiredConsent, SignUpParams } from '../auth.types';
import { useContentLanguageScreen } from './useContentLanguageScreen';

const mockNavigate = jest.fn();
const mockPopToTop = jest.fn();
const mockShowToast = jest.fn();
const mockMutateAsync =
  jest.fn<
    (input: unknown) => Promise<{ requiredConsents: RequiredConsent[]; market: Market | null }>
  >();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    popToTop: mockPopToTop,
    goBack: jest.fn(),
    isFocused: () => true,
  }),
}));
const mockAdoptSignupLanguage = jest.fn<(language: string) => void>();
jest.mock('@/shared/i18n/locale', () => ({
  ...jest.requireActual<object>('@/shared/i18n/locale'),
  APP_LANGUAGE: 'ko',
  adoptSignupLanguage: (language: string) => mockAdoptSignupLanguage(language),
}));
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: (message: string) => void }) => unknown) =>
    selector({ show: mockShowToast }),
}));
jest.mock('./useSignUpConsentsMutation', () => ({
  useSignUpConsentsMutation: () => ({ isPending: false, mutateAsync: mockMutateAsync }),
}));
jest.mock('../services/device-locale', () => ({
  getDeviceLocale: (preferredLanguage: string) => ({
    preferredLanguage,
    languageCode: 'en-US',
    timezone: 'America/New_York',
  }),
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void> | void;
  create(element: ReactNode): { unmount(): void };
}>('react-test-renderer');

let screen: ReturnType<typeof useContentLanguageScreen>;
let renderer: ReturnType<typeof create> | null = null;
function Probe({ params }: { params: SignUpParams }) {
  const current = useContentLanguageScreen(params);
  useEffect(() => {
    screen = current;
  });
  return null;
}

/** 로그인 응답의 목록 — 콘텐츠 언어를 모를 때 정해진 것이라 국외 이전 동의가 없다 */
const LOGIN_CONSENTS: RequiredConsent[] = [
  { consentType: 'terms', version: '1.0', isRequired: true },
  { consentType: 'privacy', version: '1.0', isRequired: true },
];
const GLOBAL_CONSENTS: RequiredConsent[] = [
  ...LOGIN_CONSENTS,
  { consentType: 'cross_border_transfer', version: null, isRequired: true },
];

const PARAMS: SignUpParams = { signupToken: 'signup-1', requiredConsents: LOGIN_CONSENTS };

const pressNext = async () => {
  await act(async () => {
    await screen.handleNext();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    renderer = create(<Probe params={PARAMS} />);
  });
});
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = null;
});

describe('A21 [다음] — 고른 언어로 동의 목록을 다시 받는다(PM 2026-10-16)', () => {
  it('고른 언어를 locale 로 보내고, 받은 목록·서버 판정 시장을 A4에 넘긴다', async () => {
    // given
    mockMutateAsync.mockResolvedValue({ requiredConsents: GLOBAL_CONSENTS, market: 'global' });
    act(() => screen.select('en'));

    // when
    await pressNext();

    // then
    expect(mockMutateAsync).toHaveBeenCalledWith({
      signupToken: 'signup-1',
      locale: expect.objectContaining({ preferredLanguage: 'en' }),
    });
    expect(mockNavigate).toHaveBeenCalledWith('TermsConsent', {
      signupToken: 'signup-1',
      requiredConsents: GLOBAL_CONSENTS,
      preferredLanguage: 'en',
      market: 'global',
    });
  });

  it('글로벌 가입이 닫혀 English 도 KR 로 판정되면 그 시장을 넘긴다 — A4는 서버 판정을 따른다', async () => {
    // given — GLOBAL_SIGNUP_ENABLED 닫힘(global-api.md 2.1): 국외 이전 항목 없음, 시장 kr
    mockMutateAsync.mockResolvedValue({ requiredConsents: LOGIN_CONSENTS, market: 'kr' });
    act(() => screen.select('en'));

    // when
    await pressNext();

    // then
    expect(mockNavigate).toHaveBeenCalledWith('TermsConsent', {
      signupToken: 'signup-1',
      requiredConsents: LOGIN_CONSENTS,
      preferredLanguage: 'en',
      market: 'kr',
    });
  });

  it('구 서버(404 NOT_FOUND)면 로그인 응답의 목록으로 A4에 간다', async () => {
    // given
    mockMutateAsync.mockRejectedValue(
      new ApiError(ERROR_CODES.NOT_FOUND, '찾을 수 없어요', false, null, null, 404),
    );

    // when
    await pressNext();

    // then
    expect(mockNavigate).toHaveBeenCalledWith('TermsConsent', {
      signupToken: 'signup-1',
      requiredConsents: LOGIN_CONSENTS,
      preferredLanguage: 'ko',
    });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('네트워크 오류(재시도 가능)면 토스트 후 머문다 — 목록 없이 넘기지 않는다', async () => {
    // given
    mockMutateAsync.mockRejectedValue(
      new ApiError(
        ERROR_CODES.NETWORK_ERROR,
        '네트워크 연결을 확인해주세요',
        true,
        null,
        null,
        null,
      ),
    );

    // when
    await pressNext();

    // then
    expect(mockShowToast).toHaveBeenCalledWith('네트워크 연결을 확인해주세요');
    expect(mockNavigate).not.toHaveBeenCalled();

    // [다음]을 다시 누르면 재시도다
    mockMutateAsync.mockResolvedValue({ requiredConsents: LOGIN_CONSENTS, market: null });
    await pressNext();
    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('signup_token 만료면 sign-up 과 같이 제공자 인증부터 다시 시작한다', async () => {
    // given
    mockMutateAsync.mockRejectedValue(
      new ApiError(ERROR_CODES.AUTH_SIGNUP_TOKEN_EXPIRED, '만료', false, null, null, 401),
    );

    // when
    await pressNext();

    // then
    expect(mockShowToast).toHaveBeenCalledWith(AUTH_COPY.consent.signupExpired);
    expect(mockPopToTop).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('A21 [다음] — 고른 언어로 화면 언어도 맞춘다(PM 2026-10-19)', () => {
  it('English 를 고르면 A4로 가기 전에 표시 언어를 en 으로 맞춘다', async () => {
    // given
    mockMutateAsync.mockResolvedValue({ requiredConsents: GLOBAL_CONSENTS, market: 'global' });
    act(() => screen.select('en'));

    // when
    await pressNext();

    // then
    expect(mockAdoptSignupLanguage).toHaveBeenCalledWith('en');
    expect(mockAdoptSignupLanguage.mock.invocationCallOrder[0]).toBeLessThan(
      mockNavigate.mock.invocationCallOrder[0],
    );
  });

  it('기본 선택(표시 언어)으로 넘어가면 같은 언어를 넘긴다 — 같으면 locale 이 아무것도 바꾸지 않는다', async () => {
    // given
    mockMutateAsync.mockResolvedValue({ requiredConsents: LOGIN_CONSENTS, market: 'kr' });

    // when
    await pressNext();

    // then
    expect(mockAdoptSignupLanguage).toHaveBeenCalledWith('ko');
  });

  it('구 서버라 로그인 응답의 목록으로 A4에 가도 고른 언어로 맞춘다', async () => {
    // given
    mockMutateAsync.mockRejectedValue(
      new ApiError(ERROR_CODES.NOT_FOUND, 'Not found', false, null, null, 404),
    );
    act(() => screen.select('en'));

    // when
    await pressNext();

    // then
    expect(mockAdoptSignupLanguage).toHaveBeenCalledWith('en');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('A4로 가지 않으면(토큰 만료·네트워크 오류) 화면 언어를 바꾸지 않는다', async () => {
    // given — 토큰 만료
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError(ERROR_CODES.AUTH_SIGNUP_TOKEN_EXPIRED, '만료', false, null, null, 401),
    );
    act(() => screen.select('en'));

    // when
    await pressNext();

    // then
    expect(mockAdoptSignupLanguage).not.toHaveBeenCalled();

    // given — 네트워크 오류
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError(ERROR_CODES.NETWORK_ERROR, 'offline', true, null, null, null),
    );

    // when
    await pressNext();

    // then
    expect(mockAdoptSignupLanguage).not.toHaveBeenCalled();
  });
});
