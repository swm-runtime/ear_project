import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { LOADING_INDICATOR_DELAY_MS, useDelayedVisible } from './useDelayedVisible';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다.
interface Renderer {
  root: { findByType(type: unknown): { props: { children: unknown } } };
  update(element: ReactNode): void;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

function Probe({ isActive }: { isActive: boolean }) {
  const isVisible = useDelayedVisible(isActive);
  return <Text>{isVisible ? 'visible' : 'hidden'}</Text>;
}

const shownText = (renderer: Renderer) => renderer.root.findByType(Text).props.children;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useDelayedVisible', () => {
  it('로딩이 0.3초 안에 끝나면 로딩 표시를 한 번도 띄우지 않는다', () => {
    // given
    let renderer!: Renderer;
    act(() => {
      renderer = create(<Probe isActive />);
    });

    // when
    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS - 1);
    });
    const beforeDelay = shownText(renderer);
    act(() => {
      renderer.update(<Probe isActive={false} />);
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS);
    });

    // then
    expect([beforeDelay, shownText(renderer)]).toEqual(['hidden', 'hidden']);
  });

  it('로딩이 0.3초 이상 이어지면 로딩 표시를 띄우고 끝나면 바로 거둔다', () => {
    // given
    let renderer!: Renderer;
    act(() => {
      renderer = create(<Probe isActive />);
    });

    // when
    act(() => {
      jest.advanceTimersByTime(LOADING_INDICATOR_DELAY_MS);
    });
    const duringLoading = shownText(renderer);
    act(() => {
      renderer.update(<Probe isActive={false} />);
    });

    // then
    expect([duringLoading, shownText(renderer)]).toEqual(['visible', 'hidden']);
  });
});
