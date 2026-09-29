import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
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
  it.each([-159, 320, null])('원래 좌표 %s를 닫힘 커밋 후 복원한다', async (offset) => {
    let frame: FrameRequestCallback | undefined;
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
    const restore = { current: jest.fn<(offset: number) => void>() };
    let controls!: ReturnType<typeof useSearchScrollRestoration>;
    function Feed({ searching }: { searching: boolean }) {
      controls = useSearchScrollRestoration(searching, restore);
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Feed searching={false} />);
    });
    if (offset !== null) controls.onScroll(scroll(offset));
    // 대체 인셋과 실제 음수 좌표가 달라도 관측한 좌표를 그대로 저장한다.
    controls.save(-103);
    await act(async () => {
      renderer.update(<Feed searching />);
    });
    controls.onScroll(scroll(0));
    expect(restore.current).not.toHaveBeenCalled();
    await act(async () => {
      renderer.update(<Feed searching={false} />);
    });
    expect(restore.current).not.toHaveBeenCalled();
    frame?.(0);
    expect(restore.current).toHaveBeenCalledWith(offset ?? -103);
    // 주제 선택은 기존 위치로 돌아가지 않는다.
    controls.save(-103);
    await act(async () => {
      renderer.update(<Feed searching />);
    });
    controls.discard();
    frame = undefined;
    await act(async () => {
      renderer.update(<Feed searching={false} />);
    });
    expect(frame).toBeUndefined();
    expect(restore.current).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });
});
