import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { theme } from '@/shared/theme';

import ConfirmDialog from './ConfirmDialog';
import { HAS_LIQUID_GLASS } from './GlassSurface';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다(Skeleton.test.tsx 와 같은 방식)
interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}
interface Renderer {
  root: TestNode;
  update(element: ReactNode): void;
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
    // 보조 동작 면 — iOS 26 글라스 위에선 시스템 알림 버튼 같은 반투명 회색, 그 밑은 surface.
    // 토큰과 비교한다 — 다크 모드 이후 fillSecondary 는 문자열이 아니라 동적 색 객체다(2026-10-10)
    expect(secondary.backgroundColor).toEqual(
      HAS_LIQUID_GLASS ? theme.color.fillSecondary : theme.color.surface,
    );
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

/** 버튼 라벨(Text) — onTextLayout 을 가진 글자 노드 */
const labelNode = (renderer: Renderer, label: string) =>
  renderer.root.findAll(
    (node) => typeof node.props.onTextLayout === 'function' && node.props.children === label,
  )[0];

/** 라벨이 `count` 줄로 그려졌다고 보고한다(네이티브 onTextLayout 대역) */
const reportLabelLines = (renderer: Renderer, label: string, count: number) => {
  const onTextLayout = labelNode(renderer, label).props.onTextLayout as (event: {
    nativeEvent: { lines: object[] };
  }) => void;
  act(() => {
    onTextLayout({ nativeEvent: { lines: Array.from({ length: count }, () => ({})) } });
  });
};

const actionsStyle = (renderer: Renderer) => {
  const nodes = renderer.root.findAll(
    (node) => typeof node.type !== 'string' && node.props.testID === 'confirm-dialog-actions',
  );
  return StyleSheet.flatten(nodes[0].props.style as never) as Record<string, unknown>;
};

/** 버튼 라벨이 화면에 놓인 순서 */
const buttonOrder = (renderer: Renderer, labels: string[]) =>
  renderer.root
    .findAll(
      (node) =>
        typeof node.type !== 'string' &&
        typeof node.props.onPress === 'function' &&
        labels.includes(node.props.accessibilityLabel as string),
    )
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label, index, all) => all.indexOf(label) === index);

describe('ConfirmDialog — 긴 라벨은 세로로 쌓는다(2026-10-18 영어 QA)', () => {
  const dialog = (primaryLabel: string) => (
    <ConfirmDialog
      isVisible
      title="Get notified when new content arrives?"
      secondaryAction={{ label: 'Not now', onPress: jest.fn() }}
      primaryAction={{ label: primaryLabel, onPress: jest.fn() }}
      onCloseRequest={jest.fn()}
    />
  );

  it('라벨이 한 줄이면 가로 두 칸 — 보조 왼쪽, 주 오른쪽', () => {
    // given
    const renderer = render(dialog('Allow'));

    // when
    reportLabelLines(renderer, 'Allow', 1);

    // then
    expect(actionsStyle(renderer).flexDirection).toBe('row');
    expect(buttonOrder(renderer, ['Not now', 'Allow'])).toEqual(['Not now', 'Allow']);
    act(() => renderer.unmount());
  });

  it('라벨이 두 줄로 접히면 세로로 쌓고 주 동작이 위로 간다', () => {
    // given
    const renderer = render(dialog('Turn on notifications'));

    // when — 반쪽 캡슐에서 두 줄로 접혔다고 보고된다
    reportLabelLines(renderer, 'Turn on notifications', 2);

    // then
    expect(actionsStyle(renderer).flexDirection).toBe('column');
    expect(buttonOrder(renderer, ['Not now', 'Turn on notifications'])).toEqual([
      'Turn on notifications',
      'Not now',
    ]);
    const primary = buttonStyle(renderer, 'Turn on notifications');
    expect(primary.flex).toBe(0);
    expect(primary.alignSelf).toBe('stretch');
    act(() => renderer.unmount());
  });

  it('쌓은 뒤 넓어진 버튼에서 한 줄로 재도 가로로 되돌아가지 않는다', () => {
    // given
    const renderer = render(dialog('Turn on notifications'));
    reportLabelLines(renderer, 'Turn on notifications', 2);

    // when — 전체 폭 캡슐에서는 한 줄이다
    reportLabelLines(renderer, 'Turn on notifications', 1);

    // then
    expect(actionsStyle(renderer).flexDirection).toBe('column');
    act(() => renderer.unmount());
  });

  it('라벨이 바뀌면 가로로 다시 잰다', () => {
    // given
    const renderer = render(dialog('Turn on notifications'));
    reportLabelLines(renderer, 'Turn on notifications', 2);

    // when
    act(() => {
      renderer.update(dialog('Allow'));
    });

    // then
    expect(actionsStyle(renderer).flexDirection).toBe('row');
    act(() => renderer.unmount());
  });
});
