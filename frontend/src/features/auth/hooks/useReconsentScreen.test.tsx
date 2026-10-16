import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { ageConfirmationLabel } from '../auth.copy';
import type { AuthUser, Market, RequiredConsent } from '../auth.types';
import { useReconsentScreen } from './useReconsentScreen';
import { useSessionStore } from '../store/session.store';

const mockSubmitConsents = jest.fn<(input: unknown) => Promise<void>>();

jest.mock('../api/auth.api', () => ({
  submitConsents: (input: unknown) => mockSubmitConsents(input),
}));
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: () => void }) => unknown) =>
    selector({ show: jest.fn() }),
}));
const mockOpenPolicyDocument = jest.fn<(document: string, market: string) => Promise<void>>();
jest.mock('../services/policy-document.service', () => ({
  openPolicyDocument: (document: string, market: string) =>
    mockOpenPolicyDocument(document, market),
}));
jest.mock('../services/session.service', () => ({ sessionService: { logout: jest.fn() } }));

const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void> | void;
  create(element: ReactNode): { unmount(): void };
}>('react-test-renderer');

let screen: ReturnType<typeof useReconsentScreen>;
let renderer: ReturnType<typeof create> | null = null;
function Probe() {
  const current = useReconsentScreen();
  useEffect(() => {
    screen = current;
  });
  return null;
}

const userOf = (market: Market): AuthUser => ({
  id: 'u1',
  nickname: null,
  email: null,
  isEmailVerified: false,
  provider: 'google',
  tier: 'free',
  role: 'user',
  onboardingCompleted: true,
  onboardingStep: 'done',
  market,
  languageCode: 'en-US',
  timezone: 'America/New_York',
});

/** 개정된 GLOBAL 약관 재동의 — 버전은 서버의 시장 네임스페이스 값이다(global-api.md 4.1) */
const PENDING: RequiredConsent[] = [
  { consentType: 'terms', version: 'terms_global_v1', isRequired: true },
  { consentType: 'age_confirmation', version: null, isRequired: true },
];

const renderWith = (market: Market, pending: RequiredConsent[] = PENDING) => {
  useSessionStore.getState().setSession(userOf(market), pending);
  act(() => {
    renderer = create(<Probe />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSubmitConsents.mockResolvedValue();
});
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = null;
  useSessionStore.getState().clearSession();
});

const ageRow = () => screen.items.find((item) => item.consentType === 'age_confirmation');

describe('A20 재동의 연령 확인 — 서버가 실은 나라별 기준 연령(KAN-206)', () => {
  it('서버가 16을 실으면 GLOBAL 사용자는 16세 문구를 본다', () => {
    renderWith(
      'global',
      PENDING.map((c) => (c.consentType === 'age_confirmation' ? { ...c, minAge: 16 } : c)),
    );

    expect(ageRow()?.label).toBe(ageConfirmationLabel(16));
  });

  it('서버 값이 없으면 GLOBAL 도 보수값 18세다', () => {
    renderWith('global');

    expect(ageRow()?.label).toBe(ageConfirmationLabel(18));
  });

  it('KR 사용자는 종전 18세 문구 그대로다', () => {
    renderWith('kr');

    expect(ageRow()?.label).toBe(ageConfirmationLabel(18));
  });
});

describe('A20 재동의 전송 — 버전은 pending_consents 값 그대로(KAN-206)', () => {
  it('terms_global_v1 을 바꾸지 않고 보낸다', async () => {
    // given
    renderWith('global');
    act(() => screen.toggleAll());

    // when
    await act(async () => {
      await screen.handleSubmit();
    });

    // then
    expect(mockSubmitConsents).toHaveBeenCalledWith({
      consents: [
        { consentType: 'terms', version: 'terms_global_v1', isAgreed: true },
        { consentType: 'age_confirmation', version: null, isAgreed: true },
      ],
    });
  });
});

describe('A20 국외 이전 동의 — 기존 GLOBAL 가입자(KAN-216)', () => {
  const CROSS_BORDER_PENDING: RequiredConsent[] = [
    { consentType: 'cross_border_transfer', version: null, isRequired: true },
  ];

  it('pending_consents 로 오면 필수 항목으로 그리고 체크해야 넘어간다', () => {
    renderWith('global', CROSS_BORDER_PENDING);

    expect(screen.items).toHaveLength(1);
    expect(screen.items[0]).toMatchObject({
      consentType: 'cross_border_transfer',
      isRequired: true,
    });
    expect(screen.canSubmit).toBe(false);
    act(() => screen.toggleConsent('cross_border_transfer'));
    expect(screen.canSubmit).toBe(true);
  });

  it('[보기]는 세션 시장의 처리방침 국외 이전 절을 연다', () => {
    renderWith('global', CROSS_BORDER_PENDING);

    act(() => screen.handleViewPress('cross_border_transfer'));

    expect(mockOpenPolicyDocument).toHaveBeenCalledWith('cross_border_transfer', 'global');
  });

  it('열람 문서가 없는 연령 확인은 열지 않는다', () => {
    renderWith('global');

    act(() => screen.handleViewPress('age_confirmation'));

    expect(mockOpenPolicyDocument).not.toHaveBeenCalled();
  });
});
