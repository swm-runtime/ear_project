import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

import { useTabScrollToTop } from './useTabScrollToTop';

jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn() }));

const { act, create } = jest.requireActual<{
  act(callback: () => Promise<void>): Promise<void>;
  create(node: ReactNode): { unmount(): void };
}>('react-test-renderer');

describe('검색 닫기 시 피드 위치 복원', () => {
  it.each(['list', 'scroll'] as const)(
    '%s에서 탭 재선택이 꺼져 있어도 저장한 음수 인셋과 본문 위치를 복원한다',
    async (kind) => {
      const scroll = jest.fn();
      const restore = { current: null as ((offset: number) => void) | null };
      const top = { current: null as ((animated?: boolean) => void) | null };
      function Feed() {
        const ref = useTabScrollToTop({
          enabled: false,
          topInset: 100,
          controlRef: top,
          scrollToOffsetRef: restore,
        });
        ref(kind === 'list' ? { scrollToOffset: scroll } : { scrollTo: scroll });
        return null;
      }
      let renderer!: { unmount(): void };
      await act(async () => {
        renderer = create(<Feed />);
      });
      top.current?.();
      expect(scroll).not.toHaveBeenCalled();
      for (const offset of [-100, 240]) {
        restore.current?.(offset);
        expect(scroll).toHaveBeenLastCalledWith(
          kind === 'list' ? { offset, animated: false } : { y: offset, animated: false },
        );
      }
      await act(async () => {
        renderer.unmount();
      });
      expect(restore.current).toBeNull();
    },
  );
});
