import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';

import { SUBSCRIPTION_COPY } from '../subscription.copy';
import SubscriptionLegalNotice from './SubscriptionLegalNotice';

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

/** 낭독 대상인 누를 수 있는 요소의 라벨 — 순서대로 */
const pressableLabels = (renderer: Renderer): string[] =>
  renderer.root
    .findAll(
      (node) =>
        typeof node.type !== 'string' &&
        typeof node.props.onPress === 'function' &&
        typeof node.props.accessibilityLabel === 'string',
    )
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label, index, labels) => labels.indexOf(label) === index);

describe('SubscriptionLegalNotice — 맨 아래 링크 줄(KAN-146)', () => {
  it('"이용약관 · 개인정보처리방침 · 구매 복원"이 한 줄이고 [구매 복원]이 동작한다', () => {
    // given
    const onRestore = jest.fn();
    const renderer = render(
      <SubscriptionLegalNotice
        onRestore={onRestore}
        isRestoreDisabled={false}
        isRestoring={false}
      />,
    );

    // when
    const restore = renderer.root.findAll(
      (node) =>
        typeof node.type !== 'string' &&
        node.props.accessibilityLabel === SUBSCRIPTION_COPY.restore &&
        typeof node.props.onPress === 'function',
    );
    act(() => (restore[0].props.onPress as () => void)());

    // then
    expect(pressableLabels(renderer)).toEqual([
      SUBSCRIPTION_COPY.legal.terms,
      SUBSCRIPTION_COPY.legal.privacy,
      SUBSCRIPTION_COPY.restore,
    ]);
    expect(onRestore).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it('구분점·글머리 "·"는 낭독기에서 뺀다', () => {
    // given · when
    const renderer = render(
      <SubscriptionLegalNotice
        onRestore={jest.fn()}
        isRestoreDisabled={false}
        isRestoring={false}
      />,
    );

    // then
    const dots = renderer.root.findAll(
      (node) => node.type === RNText && (node.props.children === SUBSCRIPTION_COPY.legal.separator ||
          node.props.children === SUBSCRIPTION_COPY.legal.bullet),
    );
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      expect(dot.props.accessibilityElementsHidden).toBe(true);
    }
    act(() => renderer.unmount());
  });

  it('결제·복원 중에는 [구매 복원]을 막는다', () => {
    // given · when
    const renderer = render(
      <SubscriptionLegalNotice onRestore={jest.fn()} isRestoreDisabled isRestoring />,
    );

    // then
    const restore = renderer.root.findAll(
      (node) =>
        typeof node.type !== 'string' &&
        node.props.accessibilityLabel === SUBSCRIPTION_COPY.restore &&
        typeof node.props.onPress === 'function',
    );
    expect(restore[0].props.disabled).toBe(true);
    act(() => renderer.unmount());
  });
});
