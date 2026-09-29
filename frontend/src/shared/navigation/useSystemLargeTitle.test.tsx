import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useNavigation } from '@react-navigation/native';
import type { ReactNode } from 'react';

import { useSystemLargeTitle } from './useSystemLargeTitle';

jest.mock('@react-navigation/native', () => ({ useNavigation: jest.fn() }));
jest.mock('@react-navigation/elements', () => ({
  HeaderHeightContext: jest.requireActual<typeof import('react')>('react').createContext(0),
}));
jest.mock('@/shared/ui/GlassSurface', () => ({ HAS_NATIVE_TAB_BAR: true }));
jest.mock('@/shared/ui/GlassSearchButton', () => () => null);

interface Renderer {
  update(node: ReactNode): void;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => Promise<void>): Promise<void>;
  create(node: ReactNode): Renderer;
}>('react-test-renderer');

function Header({ searching }: { searching: boolean }) {
  useSystemLargeTitle('탐색', 'toolbar', { pinnedTitle: searching });
  return null;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('iOS 검색 제목', () => {
  it('검색 진입·종료 시 네이티브 헤더 종류를 바꾸지 않고 큰 왼쪽 제목을 전환한다', async () => {
    const setOptions = jest.fn<(options: Record<string, unknown>) => void>();
    jest
      .mocked(useNavigation)
      .mockReturnValue({ setOptions } as unknown as ReturnType<typeof useNavigation>);
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(<Header searching={false} />);
    });
    expect(setOptions.mock.calls.at(-1)?.[0].headerLargeTitleEnabled).toBe(true);
    await act(async () => {
      renderer.update(<Header searching />);
    });
    const options = setOptions.mock.calls.at(-1)![0];
    expect(options.headerTitle).toBe('');
    expect(options.headerLargeTitleEnabled).toBe(false);
    const left = (
      options.unstable_headerLeftItems as () => {
        element: { props: Record<string, unknown> };
        hidesSharedBackground: boolean;
      }[]
    )();
    expect(left[0].element.props.children).toBe('탐색');
    expect(left[0].element.props.style).toMatchObject({ fontSize: 34, fontWeight: '700' });
    expect(left[0].hidesSharedBackground).toBe(true);
    await act(async () => {
      renderer.update(<Header searching={false} />);
    });
    expect(setOptions.mock.calls.at(-1)?.[0]).toMatchObject({
      headerTitle: '탐색',
      headerLargeTitleEnabled: true,
    });
    // NativeBottomTabView가 오류를 던지는 두 옵션은 진입·퇴장 어느 때도 변경하지 않는다.
    for (const [update] of setOptions.mock.calls) {
      expect(update).not.toHaveProperty('headerShown');
      expect(update).not.toHaveProperty('header');
    }
    await act(async () => {
      renderer.unmount();
    });
  });
});
