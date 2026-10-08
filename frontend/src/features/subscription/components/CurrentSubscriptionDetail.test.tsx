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

/** 누를 수 있는 요소 — 카드 안에는 하나도 없어야 한다(PM 2026-10-08) */
const pressables = (renderer: Renderer) =>
  renderer.root.findAll(
    (node) => typeof node.type !== 'string' && typeof node.props.onPress === 'function',
  );

const renderDetail = (status: SubscriptionStatusVM | null, isError = false) =>
  render(<CurrentSubscriptionDetail status={status} isError={isError} />);

describe('CurrentSubscriptionDetail — 이용 중 카드 안 구독 정보(KAN-146) · 버튼 없음(PM 2026-10-08)', () => {
  it('유료 구독자면 다음 결제일만 글자로 그린다 — [구독 해지] 같은 버튼은 없다', () => {
    // given · when
    const renderer = renderDetail({
      kind: 'subscribed',
      planName: 'Daily',
      renewsAt: '2026-11-01T03:00:00.000Z',
      pendingPlan: null,
      otherStore: null,
    });

    // then
    expect(allText(renderer)).toContain(
      SUBSCRIPTION_COPY.status.renewsAt('2026-11-01T03:00:00.000Z'),
    );
    expect(pressables(renderer)).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('해지 예약이면 카드 안에 그릴 것이 없다 — 날짜는 알림 섹션, 다시 시작은 목록 아래 버튼(KAN-160)', () => {
    // given · when
    const renderer = renderDetail({
      kind: 'cancelScheduled',
      planName: 'Pro',
      expiresAt: '2026-11-01T03:00:00.000Z',
      otherStore: null,
    });

    // then
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });

  it('결제 문제면 경고 글자만 — [결제 수단 확인]은 목록 아래 버튼이 맡는다', () => {
    // given · when
    const renderer = renderDetail({ kind: 'grace', planName: 'Pro', otherStore: null });

    // then
    expect(allText(renderer)).toContain(SUBSCRIPTION_COPY.status.paymentIssueTitle);
    expect(pressables(renderer)).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('다른 스토어 구독이면 안내 글자만 둔다', () => {
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
    expect(pressables(renderer)).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('조회 실패면 안내 글자만 — [다시 시도]를 두지 않는다(화면 복귀 때 다시 받는다)', () => {
    // given · when
    const renderer = renderDetail(null, true);

    // then
    expect(allText(renderer)).toContain(SUBSCRIPTION_COPY.status.loadError);
    expect(pressables(renderer)).toHaveLength(0);
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
