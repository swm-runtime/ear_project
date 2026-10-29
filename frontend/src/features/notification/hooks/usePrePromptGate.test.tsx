import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { usePrePromptGate } from './usePrePromptGate';
import { useNotificationStore } from '../store/notification.store';

const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): { update(element: ReactNode): void; unmount(): void };
}>('react-test-renderer');

let isVisible = false;
let renderer: { update(element: ReactNode): void; unmount(): void } | null = null;
function Probe({ isHeld }: { isHeld: boolean }) {
  const visible = usePrePromptGate(isHeld);
  useEffect(() => {
    isVisible = visible;
  });
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  isVisible = false;
  useNotificationStore.getState().markPrePromptPending();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  useNotificationStore.getState().clearPrePromptPending();
  jest.useRealTimers();
});

describe('usePrePromptGate — 알림 사전 안내(O10)를 여는 때', () => {
  it('신호가 서면 한 박자(400ms) 쉬고 연다', () => {
    act(() => {
      renderer = create(<Probe isHeld={false} />);
    });
    expect(isVisible).toBe(false);

    act(() => jest.advanceTimersByTime(400));

    expect(isVisible).toBe(true);
  });

  it('플레이어가 떠 있거나 여는 중이면(KAN-295) 붙들었다가, 풀린 뒤 지연을 처음부터 세고 연다', () => {
    // given — 온보딩 직후 첫 콘텐츠의 플레이어가 열리는 중
    act(() => {
      renderer = create(<Probe isHeld />);
    });
    act(() => jest.advanceTimersByTime(5_000));
    expect(isVisible).toBe(false);

    // when — 플레이어를 닫는다
    act(() => renderer?.update(<Probe isHeld={false} />));

    // then — 닫자마자 튀지 않고 한 박자 뒤 연다
    act(() => jest.advanceTimersByTime(399));
    expect(isVisible).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(isVisible).toBe(true);
  });
});
