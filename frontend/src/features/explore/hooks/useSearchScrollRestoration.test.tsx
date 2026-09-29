import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useSearchScrollRestoration } from './useSearchScrollRestoration';

const { act, create } = jest.requireActual<{
  act(callback: () => Promise<void>): Promise<void>;
  create(node: ReactNode): { update(node: ReactNode): void; unmount(): void };
}>('react-test-renderer');
const scroll = (y: number) =>
  ({ nativeEvent: { contentOffset: { y } } }) as NativeSyntheticEvent<NativeScrollEvent>;
afterEach(() => {
  jest.restoreAllMocks();
});

describe('검색 전 실제 피드 위치 복원', () => {
  it.each([-159, 320, null])('원래 좌표 %s를 덮개 퇴장 시작 전에 복원한다', async (offset) => {
    const restore = { current: jest.fn<(offset: number) => void>() };
    const beginExit = jest.fn();
    let controls!: ReturnType<typeof useSearchScrollRestoration>;
    function Feed({ closing }: { closing: boolean }) {
      controls = useSearchScrollRestoration(closing, restore);
      // 검색 화면은 useEffect에서 퇴장 애니메이션을 시작한다.
      useEffect(() => {
        if (closing) beginExit(restore.current.mock.calls.length);
      }, [closing]);
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Feed closing={false} />);
    });
    if (offset !== null) controls.onScroll(scroll(offset));
    // 대체 인셋과 실제 음수 좌표가 달라도 관측한 좌표를 그대로 저장한다.
    controls.save(-103);
    await act(async () => {
      renderer.update(<Feed closing={false} />);
    });
    controls.onScroll(scroll(0));
    expect(restore.current).not.toHaveBeenCalled();
    await act(async () => {
      renderer.update(<Feed closing />);
    });
    expect(restore.current).toHaveBeenCalledWith(offset ?? -103);
    expect(beginExit).toHaveBeenLastCalledWith(1);
    // 덮개 제거 이후에는 복원 명령이 다시 발생하지 않는다.
    await act(async () => {
      renderer.update(<Feed closing={false} />);
    });
    expect(restore.current).toHaveBeenCalledTimes(1);
    // 주제 선택은 기존 위치로 돌아가지 않는다.
    controls.save(-103);
    await act(async () => {
      renderer.update(<Feed closing={false} />);
    });
    controls.discard();
    await act(async () => {
      renderer.update(<Feed closing />);
    });
    expect(restore.current).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });
});
