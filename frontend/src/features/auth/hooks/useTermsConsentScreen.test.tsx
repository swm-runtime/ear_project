import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { ageConfirmationLabel } from '../auth.copy';
import type { AuthStackParamList, RequiredConsent } from '../auth.types';
import { useTermsConsentScreen } from './useTermsConsentScreen';

const mockMutateAsync = jest.fn<(input: unknown) => Promise<unknown>>();
const mockStartSession = jest.fn<() => Promise<void>>();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ popToTop: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('@/shared/lib/device-id', () => ({
  getDeviceId: () => Promise.resolve('device-1'),
}));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: () => void }) => unknown) =>
    selector({ show: jest.fn() }),
}));
jest.mock('./useSignUpMutation', () => ({
  useSignUpMutation: () => ({ isPending: false, mutateAsync: mockMutateAsync }),
}));
jest.mock('../services/device-locale', () => ({
  getDeviceLocale: (preferredLanguage: string) => ({
    preferredLanguage,
    languageCode: 'en-US',
    timezone: 'America/New_York',
  }),
}));
const mockOpenPolicyDocument = jest.fn<(document: string, market: string) => Promise<void>>();
jest.mock('../services/policy-document.service', () => ({
  openPolicyDocument: (document: string, market: string) =>
    mockOpenPolicyDocument(document, market),
}));
jest.mock('../services/session.service', () => ({
  sessionService: { startSession: () => mockStartSession() },
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void> | void;
  create(element: ReactNode): { unmount(): void };
}>('react-test-renderer');

type Params = AuthStackParamList['TermsConsent'];
let screen: ReturnType<typeof useTermsConsentScreen>;
let renderer: ReturnType<typeof create> | null = null;
function Probe({ params }: { params: Params }) {
  const current = useTermsConsentScreen(params);
  useEffect(() => {
    screen = current;
  });
  return null;
}

/** 서버가 내려준 GLOBAL 시장 동의 목록 — 버전에 시장 네임스페이스가 붙는다(global-api.md 4.1) */
const GLOBAL_CONSENTS: RequiredConsent[] = [
  { consentType: 'terms', version: 'terms_global_v1', isRequired: true },
  { consentType: 'privacy', version: 'privacy_global_v1', isRequired: true },
  { consentType: 'marketing', version: 'marketing_global_v1', isRequired: false },
  { consentType: 'age_confirmation', version: null, isRequired: true },
];

const render = (params: Params) => {
  act(() => {
    renderer = create(<Probe params={params} />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMutateAsync.mockResolvedValue({ tokens: {}, user: {} });
  mockStartSession.mockResolvedValue();
});
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = null;
});

const ageRow = () => screen.items.find((item) => item.consentType === 'age_confirmation');

describe('A4 연령 확인 — A21 선택이 가리키는 시장의 기준 연령(KAN-206)', () => {
  it('English 를 고르면(GLOBAL) 16세 문구를 그린다', () => {
    render({ signupToken: 't', requiredConsents: GLOBAL_CONSENTS, preferredLanguage: 'en' });

    expect(ageRow()?.label).toBe(ageConfirmationLabel('global'));
    expect(ageRow()?.label).not.toBe(ageConfirmationLabel('kr'));
  });

  it('한국어를 고르면(KR) 종전 18세 문구 그대로다', () => {
    render({ signupToken: 't', requiredConsents: GLOBAL_CONSENTS, preferredLanguage: 'ko' });

    expect(ageRow()?.label).toBe(ageConfirmationLabel('kr'));
  });

  it('연령 확인을 체크하지 않으면 가입 버튼이 비활성이다 — 미충족이면 계정을 만들지 않는다', () => {
    render({ signupToken: 't', requiredConsents: GLOBAL_CONSENTS, preferredLanguage: 'en' });

    act(() => screen.toggleConsent('terms'));
    act(() => screen.toggleConsent('privacy'));

    expect(screen.canSubmit).toBe(false);
  });
});

describe('A4 동의 전송 — 버전은 서버 값 그대로(KAN-206)', () => {
  it('서버가 준 terms_global_v1 등의 버전을 바꾸지 않고 보낸다', async () => {
    // given
    render({ signupToken: 't', requiredConsents: GLOBAL_CONSENTS, preferredLanguage: 'en' });
    act(() => screen.toggleAll());

    // when
    await act(async () => {
      await screen.handleSubmit();
    });

    // then
    const [input] = mockMutateAsync.mock.calls[0] as [
      { consents: { consentType: string; version: string | null }[] },
    ];
    const versionOf = (type: string) => input.consents.find((c) => c.consentType === type)?.version;
    expect(versionOf('terms')).toBe('terms_global_v1');
    expect(versionOf('privacy')).toBe('privacy_global_v1');
    expect(versionOf('marketing')).toBe('marketing_global_v1');
    expect(versionOf('age_confirmation')).toBeNull();
  });
});

describe('A4 국외 이전 동의 — 서버 목록대로 그린다(KAN-216)', () => {
  /** 재조회로 받은 GLOBAL 목록 — 국외 이전 동의가 필수로 붙는다 */
  const WITH_CROSS_BORDER: RequiredConsent[] = [
    ...GLOBAL_CONSENTS,
    { consentType: 'cross_border_transfer', version: null, isRequired: true },
  ];
  const crossBorderRow = () =>
    screen.items.find((item) => item.consentType === 'cross_border_transfer');

  it('서버가 실어 보내면 필수 항목으로 그리고, 체크 전에는 가입 버튼이 비활성이다', () => {
    render({ signupToken: 't', requiredConsents: WITH_CROSS_BORDER, preferredLanguage: 'en' });

    expect(crossBorderRow()).toMatchObject({ isRequired: true, isChecked: false });
    act(() => screen.toggleConsent('terms'));
    act(() => screen.toggleConsent('privacy'));
    act(() => screen.toggleConsent('age_confirmation'));
    expect(screen.canSubmit).toBe(false);

    act(() => screen.toggleConsent('cross_border_transfer'));
    expect(screen.canSubmit).toBe(true);
  });

  it('서버 목록에 없으면(KR) 그리지 않는다 — 클라이언트가 시장으로 넣지 않는다', () => {
    render({ signupToken: 't', requiredConsents: GLOBAL_CONSENTS, preferredLanguage: 'en' });

    expect(crossBorderRow()).toBeUndefined();
  });

  it('[보기]는 A21 선택이 가리키는 시장의 문서를 연다 — English 면 GLOBAL', () => {
    render({ signupToken: 't', requiredConsents: WITH_CROSS_BORDER, preferredLanguage: 'en' });

    act(() => screen.handleViewPress('cross_border_transfer'));
    act(() => screen.handleViewPress('terms'));

    expect(mockOpenPolicyDocument).toHaveBeenNthCalledWith(1, 'cross_border_transfer', 'global');
    expect(mockOpenPolicyDocument).toHaveBeenNthCalledWith(2, 'terms', 'global');
  });

  it('서버 판정 시장이 오면 그것을 따른다 — 글로벌 가입이 닫혀 English 도 KR 이면 KR 문서·18세', () => {
    render({
      signupToken: 't',
      requiredConsents: GLOBAL_CONSENTS,
      preferredLanguage: 'en',
      market: 'kr',
    });

    act(() => screen.handleViewPress('terms'));

    expect(mockOpenPolicyDocument).toHaveBeenCalledWith('terms', 'kr');
    expect(ageRow()?.label).toBe(ageConfirmationLabel('kr'));
  });

  it('한국어를 고르면 KR 문서를 연다', () => {
    render({ signupToken: 't', requiredConsents: GLOBAL_CONSENTS, preferredLanguage: 'ko' });

    act(() => screen.handleViewPress('privacy'));

    expect(mockOpenPolicyDocument).toHaveBeenCalledWith('privacy', 'kr');
  });
});
