import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';

import { useExploreSearchRequest } from './useExploreSearchRequest';

const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
let mockRouteParams: { searchQuery?: string } | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setParams: mockSetParams }),
  useRoute: () => ({ key: 'Explore-1', name: 'Explore', params: mockRouteParams }),
}));

const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): { update(element: ReactNode): void; unmount(): void };
}>('react-test-renderer');

let result: ReturnType<typeof useExploreSearchRequest>;
function Probe({ isInline }: { isInline: boolean; tick?: number }) {
  const current = useExploreSearchRequest({ isInline });
  useEffect(() => {
    result = current;
  });
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = undefined;
});

describe('useExploreSearchRequest — 질의를 넘겨 검색을 연다(KAN-219)', () => {
  describe('제자리 검색 갈래(iOS 26·Android)', () => {
    it('탭 파라미터로 `#태그`를 받으면 검색 요청을 내놓고 파라미터를 소거한다', () => {
      // given
      mockRouteParams = { searchQuery: '#뱅크런' };

      // when
      act(() => {
        create(<Probe isInline />);
      });

      // then
      expect(result.request).toEqual({ query: '#뱅크런', id: 1 });
      expect(mockSetParams).toHaveBeenCalledWith({ searchQuery: undefined });
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('소거 뒤 같은 태그를 다시 받으면 새 요청(id 증가)으로 다시 검색한다', () => {
      // given
      mockRouteParams = { searchQuery: '#뱅크런' };
      let renderer: ReturnType<typeof create> | null = null;
      act(() => {
        renderer = create(<Probe isInline tick={0} />);
      });
      mockRouteParams = undefined;
      act(() => renderer?.update(<Probe isInline tick={1} />));

      // when
      mockRouteParams = { searchQuery: '#뱅크런' };
      act(() => renderer?.update(<Probe isInline tick={2} />));

      // then
      expect(result.request).toEqual({ query: '#뱅크런', id: 2 });
    });

    it('화면 안의 태그 탭(requestSearch)도 같은 요청을 내놓는다 — 화면을 이동하지 않는다', () => {
      // given
      act(() => {
        create(<Probe isInline />);
      });

      // when
      act(() => result.requestSearch('#금리'));

      // then
      expect(result.request).toEqual({ query: '#금리', id: 1 });
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('스택 검색 갈래(iOS 26 미만·웹)', () => {
    it('탭 파라미터로 `#태그`를 받으면 검색 화면을 그 질의로 열고 파라미터를 소거한다', () => {
      // given
      mockRouteParams = { searchQuery: '#뱅크런' };

      // when
      act(() => {
        create(<Probe isInline={false} />);
      });

      // then
      expect(mockNavigate).toHaveBeenCalledWith('Main', {
        screen: 'ExploreSearch',
        params: { initialQuery: '#뱅크런' },
      });
      expect(mockSetParams).toHaveBeenCalledWith({ searchQuery: undefined });
      expect(result.request).toBeNull();
    });

    it('화면 안의 태그 탭(requestSearch)은 검색 화면을 그 질의로 연다', () => {
      // given
      act(() => {
        create(<Probe isInline={false} />);
      });

      // when
      act(() => result.requestSearch('#금리'));

      // then
      expect(mockNavigate).toHaveBeenCalledWith('Main', {
        screen: 'ExploreSearch',
        params: { initialQuery: '#금리' },
      });
    });
  });

  it('파라미터가 없으면 아무것도 하지 않는다 — 검색창으로 연 검색은 초기 화면부터다', () => {
    // when
    act(() => {
      create(<Probe isInline />);
    });

    // then
    expect(result.request).toBeNull();
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
