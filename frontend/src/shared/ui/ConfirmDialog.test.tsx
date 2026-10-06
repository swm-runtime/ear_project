import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { theme } from '@/shared/theme';

import ConfirmDialog from './ConfirmDialog';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다(Skeleton.test.tsx 와 같은 방식)
interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}
interface Renderer {
  root: TestNode;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

const render = (element: ReactNode) => {
  let renderer!: Renderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
};

/** 라벨로 버튼(Pressable) 의 스타일을 펼친다 */
const buttonStyle = (renderer: Renderer, label: string) => {
  const nodes = renderer.root.findAll(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  return StyleSheet.flatten(nodes[0].props.style as never) as Record<string, unknown>;
};

describe('ConfirmDialog — 공용 알약 버튼(KAN-146)', () => {
  it('주·보조 버튼이 알약(full) + 연속 곡률이다', () => {
    // given · when
    const renderer = render(
      <ConfirmDialog
        isVisible
        title="제목"
        secondaryAction={{ label: '취소', onPress: jest.fn() }}
        primaryAction={{ label: '확인', onPress: jest.fn() }}
        onCloseRequest={jest.fn()}
      />,
    );

    // then
    const primary = buttonStyle(renderer, '확인');
    const secondary = buttonStyle(renderer, '취소');
    expect(primary.borderRadius).toBe(theme.radius.full);
    expect(primary.borderCurve).toBe('continuous');
    expect(primary.backgroundColor).toBe(theme.color.primary);
    expect(secondary.borderRadius).toBe(theme.radius.full);
    expect(secondary.borderCurve).toBe('continuous');
    expect(secondary.backgroundColor).toBe(theme.color.surface);
    act(() => renderer.unmount());
  });

  it('파괴적 확인은 채운 빨강 알약이다', () => {
    // given · when
    const renderer = render(
      <ConfirmDialog
        isVisible
        title="로그아웃할까요?"
        secondaryAction={{ label: '취소', onPress: jest.fn() }}
        primaryAction={{ label: '로그아웃', onPress: jest.fn(), isDestructive: true }}
        onCloseRequest={jest.fn()}
      />,
    );

    // then
    const destructive = buttonStyle(renderer, '로그아웃');
    expect(destructive.backgroundColor).toBe(theme.color.danger);
    expect(destructive.borderRadius).toBe(theme.radius.full);
    act(() => renderer.unmount());
  });
});
