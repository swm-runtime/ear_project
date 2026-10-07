import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';

import type { SubscriptionStatusVM } from '../hooks/subscription-status';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import CurrentSubscriptionDetail from './CurrentSubscriptionDetail';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다(Skeleton.test.tsx 와 같은 방식)
interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}
interface Renderer {
  root: TestNode;
  toJSON(): unknown;
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

const allText = (renderer: Renderer): string[] =>
  renderer.root
    .findAll((node) => node.type === RNText && typeof node.props.children === 'string')
    .map((node) => node.props.children as string);

/** 누를 수 있는 요소(Pressable — 함수 컴포넌트 쪽) */
const buttonByLabel = (renderer: Renderer, label: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );

const renderDetail = (status: SubscriptionStatusVM | null, onOpenStore = jest.fn()) =>
  render(
    <CurrentSubscriptionDetail
      status={status}
      isError={false}
      onRetry={jest.fn()}
      isRetrying={false}
      onOpenStore={onOpenStore}
    />,
  );

describe('CurrentSubscriptionDetail — 이용 중 카드 안 구독 정보(KAN-146)', () => {
  it('유료 구독자면 다음 결제일과 누를 수 있는 [구독 해지]를 그린다', () => {
    // given
    const onOpenStore = jest.fn();
    const renderer = renderDetail(
      {
        kind: 'subscribed',
        planName: 'Daily',
        renewsAt: '2026-11-01T03:00:00.000Z',
        pendingPlan: null,
        otherStore: null,
      },
      onOpenStore,
    );

    // when
    const cancel = buttonByLabel(renderer, SUBSCRIPTION_COPY.manage.cancel);
    act(() => (cancel[0].props.onPress as () => void)());

    // then
    expect(allText(renderer)).toContain(
      SUBSCRIPTION_COPY.status.renewsAt('2026-11-01T03:00:00.000Z'),
    );
    expect(cancel.length).toBeGreaterThan(0);
    expect(cancel[0].props.disabled).toBeFalsy();
    expect(onOpenStore).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it('해지 예약이면 "N월 N일까지 이용 가능해요"와 [구독 다시 시작]을 그린다', () => {
    // given · when
    const renderer = renderDetail({
      kind: 'cancelScheduled',
      planName: 'Pro',
      expiresAt: '2026-11-01T03:00:00.000Z',
      otherStore: null,
    });

    // then
    expect(allText(renderer)).toContain(
      SUBSCRIPTION_COPY.status.cancelScheduled('2026-11-01T03:00:00.000Z'),
    );
    expect(buttonByLabel(renderer, SUBSCRIPTION_COPY.manage.resume).length).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });

  it('다른 스토어 구독이면 안내만 두고 스토어 버튼을 그리지 않는다', () => {
    // given · when
    const renderer = renderDetail({
      kind: 'subscribed',
      planName: 'Daily',
      renewsAt: null,
      pendingPlan: null,
      otherStore: 'play_store',
    });

    // then
    expect(allText(renderer)).toContain(SUBSCRIPTION_COPY.status.otherStore('play_store'));
    expect(buttonByLabel(renderer, SUBSCRIPTION_COPY.manage.cancel)).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('무료 이용자는 따로 그릴 것이 없다 — 이용 중 카드의 설명이 한도를 말한다', () => {
    // given · when
    const renderer = renderDetail({ kind: 'free', dailyPlayLimit: 2 });

    // then
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });
});
