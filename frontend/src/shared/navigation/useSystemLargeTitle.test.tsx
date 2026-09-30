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
  useSystemLargeTitle('탐색', searching ? 'search-toolbar' : 'feed-toolbar');
  return null;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('iOS 검색 제목', () => {
  it('검색 툴바가 바뀌어도 같은 시스템 제목을 유지한다', async () => {
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
    expect(options.headerTitle).toBe('탐색');
    expect(options.headerLargeTitleEnabled).toBe(true);
    const left = (
      options.unstable_headerLeftItems as () => {
        element: { props: Record<string, unknown> };
        hidesSharedBackground: boolean;
      }[]
    )();
    expect(left).toEqual([]);
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
      expect(update.headerTitle).toBe('탐색');
      expect(update.headerLargeTitleEnabled).toBe(true);
      expect(update).not.toHaveProperty('headerLargeTitleStyle');
    }
    await act(async () => {
      renderer.unmount();
    });
  });
});
