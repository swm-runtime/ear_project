import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import type { WithdrawalPreview } from '../auth.types';
import { useWithdrawalScreen } from './useWithdrawalScreen';

const mockMutate = jest.fn();
const mockNavigation = {
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  goBack: jest.fn(),
};
let mockPreview: WithdrawalPreview;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));
jest.mock('@/shared/analytics', () => ({ track: jest.fn() }));
jest.mock('@/shared/hooks/useDelayedVisible', () => ({ useDelayedVisible: () => false }));
jest.mock('@/shared/lib/generate-id', () => ({ generateId: () => 'idempotency-key' }));
jest.mock('@/shared/lib/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: () => void }) => unknown) =>
    selector({ show: jest.fn() }),
}));
jest.mock('./useWithdrawalPreviewQuery', () => ({
  useWithdrawalPreviewQuery: () => ({
    data: mockPreview,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('./useWithdrawMutation', () => ({
  useWithdrawMutation: () => ({ isPending: false, mutate: mockMutate }),
}));
jest.mock('../services/session.service', () => ({
  sessionService: { clearSession: jest.fn() },
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): { unmount(): void };
}>('react-test-renderer');
let screen: ReturnType<typeof useWithdrawalScreen>;
let renderer: ReturnType<typeof create>;
function Probe() {
  const current = useWithdrawalScreen();
  useEffect(() => {
    screen = current;
  });
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPreview = {
    hasPaymentHistory: false,
    hasActiveSubscription: false,
    subscriptionExpiryAgreementRequired: false,
    retained: null,
  };
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
});

describe('탈퇴 사유는 필수다(KAN-205)', () => {
  it('최종 확인 체크를 마쳤어도 사유를 고르지 않았으면 [탈퇴하기]는 비활성이다', () => {
    // given
    act(() => screen.toggleConfirm());

    // when
    const { canSubmit, reasonCode } = screen;

    // then
    expect(reasonCode).toBeNull();
    expect(canSubmit).toBe(false);
  });

  it('사유를 고르지 않은 채 [탈퇴하기]를 누르면 탈퇴 요청을 보내지 않는다', () => {
    // given
    act(() => screen.toggleConfirm());

    // when
    act(() => screen.handleSubmitPress());

    // then
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('사유를 고르고 확인 체크를 마치면 [탈퇴하기]가 활성된다', () => {
    // given
    act(() => screen.toggleReason('low_usage'));

    // when
    act(() => screen.toggleConfirm());

    // then
    expect(screen.canSubmit).toBe(true);
  });

  it('활성 구독이면 사유와 확인 체크가 있어도 만료 동의 없이는 [탈퇴하기]가 비활성이다', () => {
    // given
    mockPreview = { ...mockPreview, subscriptionExpiryAgreementRequired: true };
    act(() => renderer.unmount());
    act(() => {
      renderer = create(<Probe />);
    });

    // when
    act(() => screen.toggleReason('low_usage'));
    act(() => screen.toggleConfirm());

    // then
    expect(screen.canSubmit).toBe(false);
  });

  it('사유를 고르고 [탈퇴하기]를 누르면 요청 본문의 reason_code가 고른 값이다', () => {
    // given
    act(() => screen.toggleReason('app_issue'));
    act(() => screen.toggleConfirm());

    // when
    act(() => screen.handleSubmitPress());

    // then
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: expect.objectContaining({ reasonCode: 'app_issue' }),
      }),
      expect.anything(),
    );
  });
});

describe('탈퇴 사유는 단일 선택(라디오)이다(KAN-205)', () => {
  it('고른 사유를 다시 탭해도 선택이 유지된다', () => {
    // given
    act(() => screen.toggleReason('low_usage'));

    // when
    act(() => screen.toggleReason('low_usage'));

    // then
    expect(screen.reasonCode).toBe('low_usage');
  });

  it('사유 A를 고른 뒤 사유 B를 탭하면 B만 선택된다', () => {
    // given
    act(() => screen.toggleReason('low_usage'));

    // when
    act(() => screen.toggleReason('other'));

    // then
    expect(screen.reasonCode).toBe('other');
  });
});
