import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { AuthUser, MarketChangePreview, MarketChangeResult } from '../auth.types';
import { useMarketChangeScreen } from './useMarketChangeScreen';

const mockNavigation = { goBack: jest.fn(), canGoBack: jest.fn(() => true) };
const mockRefetch = jest.fn();
const mockShowToast = jest.fn();
const mockChangeMarket = jest.fn<(input: unknown) => Promise<MarketChangeResult>>();
const mockSwitchMarket = jest.fn<(input: unknown) => Promise<void>>();
const mockNotify = jest.fn();
const mockMarkReonboarding = jest.fn();
let mockPreview: MarketChangePreview;
let mockRevertTarget: 'kr' | 'global' | null = null;

jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockPreview,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: mockRefetch,
  }),
}));
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: typeof mockShowToast }) => unknown) =>
    selector({ show: mockShowToast }),
}));
jest.mock('../api/market-change.api', () => ({
  changeMarket: (input: unknown) => mockChangeMarket(input),
  fetchMarketChangePreview: jest.fn(),
  marketChangeKeys: { preview: () => ['market-change'] },
}));
jest.mock('../services/session.service', () => ({
  sessionService: { switchMarket: (input: unknown) => mockSwitchMarket(input) },
}));
jest.mock('../services/market-changed-listener', () => ({
  notifyMarketChanged: (market: unknown) => mockNotify(market),
}));
jest.mock('../services/market-change-state', () => ({
  getMarketChangeRevertTarget: () => mockRevertTarget,
  markReonboardingAfterMarketChange: (input: unknown) => mockMarkReonboarding(input),
}));
jest.mock('../services/policy-document.service', () => ({ openPolicyDocument: jest.fn() }));
jest.mock('../store/session.store', () => ({
  selectMarket: () => 'kr',
  useSessionStore: (selector: (state: unknown) => unknown) => selector({}),
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void> | void;
  create(element: ReactNode): { unmount(): void };
}>('react-test-renderer');
let screen: ReturnType<typeof useMarketChangeScreen>;
let renderer: ReturnType<typeof create>;
function Probe() {
  const current = useMarketChangeScreen('en');
  useEffect(() => {
    screen = current;
  });
  return null;
}

const globalUser = { market: 'global', onboardingCompleted: false } as AuthUser;

const render = () => {
  void act(() => {
    renderer = create(<Probe />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRevertTarget = null;
  mockPreview = {
    currentMarket: 'kr',
    targetMarket: 'global',
    available: true,
    blockedReason: null,
    retryAfterSec: null,
    requiredConsents: [
      { consentType: 'terms', version: 'global-0.1', isRequired: true },
      { consentType: 'cross_border_transfer', version: null, isRequired: true },
      { consentType: 'age_confirmation', version: 'age-16', isRequired: true, minAge: 16 },
    ],
  };
});
afterEach(() => {
  void act(() => renderer.unmount());
});

describe('시장 전환 화면(KAN-228)', () => {
  it('필수 동의를 다 체크하기 전에는 [바꾸기]가 비활성이고, 연령 문구는 서버 min_age 를 쓴다', () => {
    render();
    expect(screen.canSubmit).toBe(false);
    expect(screen.items.find((item) => item.consentType === 'age_confirmation')?.label).toContain(
      '16',
    );

    void act(() => screen.toggleAll());
    expect(screen.canSubmit).toBe(true);
  });

  it('성공하면 새 토큰으로 세션을 바꾸고, 재온보딩 표시(직전 시장)를 남긴 뒤 통지한다', async () => {
    mockChangeMarket.mockResolvedValue({ user: globalUser, accessToken: 'new-access' });
    render();
    void act(() => screen.toggleAll());

    await act(async () => {
      await screen.handleSubmit();
    });

    expect(mockChangeMarket).toHaveBeenCalledWith({
      language: 'en',
      consents: [
        { consentType: 'terms', version: 'global-0.1', isAgreed: true },
        { consentType: 'cross_border_transfer', version: null, isAgreed: true },
        { consentType: 'age_confirmation', version: 'age-16', isAgreed: true },
      ],
    });
    expect(mockMarkReonboarding).toHaveBeenCalledWith({ previousMarket: 'kr', isRevert: false });
    expect(mockSwitchMarket).toHaveBeenCalledWith({ accessToken: 'new-access', user: globalUser });
    expect(mockNotify).toHaveBeenCalledWith('global');
  });

  it('재온보딩 중 직전 시장으로 가면 되돌리기로 적는다 — 다시 되돌릴 수 없다', async () => {
    mockRevertTarget = 'global';
    mockChangeMarket.mockResolvedValue({ user: globalUser, accessToken: 'new-access' });
    render();
    void act(() => screen.toggleAll());

    await act(async () => {
      await screen.handleSubmit();
    });

    expect(mockMarkReonboarding).toHaveBeenCalledWith({ previousMarket: 'kr', isRevert: true });
  });

  it('이미 그 시장이면(access_token null) 세션을 건드리지 않고 돌아간다', async () => {
    mockChangeMarket.mockResolvedValue({ user: globalUser, accessToken: null });
    render();
    void act(() => screen.toggleAll());

    await act(async () => {
      await screen.handleSubmit();
    });

    expect(mockSwitchMarket).not.toHaveBeenCalled();
    expect(mockMarkReonboarding).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('미리보기가 하루 1번에 걸리면 동의 대신 안내 — 남은 시간은 시간 단위 올림', () => {
    mockPreview = {
      ...mockPreview,
      available: false,
      blockedReason: 'cooldown',
      retryAfterSec: 2 * 3600 + 1,
    };
    render();
    expect(screen.blocked?.reason).toBe('cooldown');
    expect(screen.blockedHours).toBe(3);
    expect(screen.canSubmit).toBe(false);
  });

  it('동의 버전이 낡았으면(409) 미리보기를 다시 받고 체크를 비운다 — 가입 재조회가 아니다', async () => {
    mockChangeMarket.mockRejectedValue(
      new ApiError(ERROR_CODES.CONSENT_VERSION_STALE, 'stale', false, null, null, 409),
    );
    render();
    void act(() => screen.toggleAll());

    await act(async () => {
      await screen.handleSubmit();
    });

    expect(mockRefetch).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalled();
    expect(screen.isAllChecked).toBe(false);
    expect(mockSwitchMarket).not.toHaveBeenCalled();
  });

  it('전환 요청이 429 로 오면 그 자리에서 하루 1번 안내로 바꾼다', async () => {
    mockChangeMarket.mockRejectedValue(
      new ApiError(ERROR_CODES.MARKET_CHANGE_COOLDOWN, 'cooldown', false, 3600, null, 429),
    );
    render();
    void act(() => screen.toggleAll());

    await act(async () => {
      await screen.handleSubmit();
    });

    expect(screen.blocked).toEqual({ reason: 'cooldown', retryAfterSec: 3600 });
    expect(mockSwitchMarket).not.toHaveBeenCalled();
  });
});
