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
jest.mock('../services/policy-document.service', () => ({ openPolicyDocument: jest.fn() }));
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
