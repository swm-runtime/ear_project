import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet, Text as RNText, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/shared/theme';

import type { PlanCardVM } from '../hooks/plan-catalog';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { Plan, PlanAction } from '../subscription.types';
import PlanList from './PlanList';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다(Skeleton.test.tsx 와 같은 방식)
interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  children: (TestNode | string)[];
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

/** 글자 노드 — 문자열 자식 하나를 가진 Text */
/** 스타일 배열을 펼쳐 값만 본다 */
const flat = (style: unknown) =>
  StyleSheet.flatten(style as StyleProp<ViewStyle>) as Record<string, unknown>;

const textNodes = (renderer: Renderer, text: string) =>
  renderer.root.findAll((node) => node.type === RNText && node.props.children === text);

const allText = (renderer: Renderer): string[] =>
  renderer.root
    .findAll((node) => node.type === RNText && typeof node.props.children === 'string')
    .map((node) => node.props.children as string);

const makeCard = (
  overrides: Partial<Plan> & { action: PlanAction },
  price: string,
): PlanCardVM => ({
  plan: {
    planId: `plan-${overrides.tier ?? 'x'}`,
    tier: overrides.tier ?? 'x',
    // 이름·설명은 서버 값 — 화면이 티어명을 만들지 않는다는 것을 보이려고 일부러 낯선 이름을 쓴다
    name: overrides.name ?? '서버이름',
    description: overrides.description ?? '서버 설명',
    priceKrw: 0,
    storeProductId: overrides.storeProductId ?? null,
    entitlements: { dailyPlayLimit: 2, dailyDripCount: 2, dripEnabled: true, adsEnabled: true },
    action: overrides.action,
  },
  priceLabel: price,
});

const FREE_CURRENT = makeCard(
  { tier: 'light', name: '가벼운', description: '하루 2편까지 들을 수 있어요', action: 'current' },
  SUBSCRIPTION_COPY.plans.freePrice,
);
const PAID_PURCHASE = makeCard(
  {
    tier: 'daily',
    name: '매일',
    description: '하루 5편까지 들을 수 있어요',
    storeProductId: 'daily.monthly',
    action: 'purchase',
  },
  '₩3,900',
);

const renderList = (cards: PlanCardVM[], currentDetail?: ReactNode) =>
  render(
    <PlanList
      state={{ kind: 'ready', cards, isEmailVerified: true }}
      isBusy={false}
      purchasingPlanId={null}
      onPurchase={jest.fn()}
      onRetry={jest.fn()}
      isRetrying={false}
      currentDetail={currentDetail}
    />,
  );

describe('PlanList — 요금제 카드(KAN-146)', () => {
  it('이용 중 카드는 이름·가격·설명을 회색 단계로 내리고 [이용 중] 회색 알약을 둔다', () => {
    // given · when
    const renderer = renderList([FREE_CURRENT, PAID_PURCHASE]);

    // then
    const name = flat(textNodes(renderer, '가벼운')[0].props.style);
    const description = flat(textNodes(renderer, '하루 2편까지 들을 수 있어요')[0].props.style);
    expect(name.color).toBe(theme.color.textMuted);
    expect(description.color).toBe(theme.color.textMutedSecondary);
    const currentLabel = textNodes(renderer, SUBSCRIPTION_COPY.plans.current);
    expect(currentLabel).toHaveLength(1);
    expect(flat(currentLabel[0].props.style).color).toBe(theme.color.textMuted);
    // [이용 중]은 누를 수 있는 버튼이 아니다
    const pressables = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.type !== 'string',
    );
    expect(
      pressables.some((node) => String(node.props.accessibilityLabel).includes('이용 중')),
    ).toBe(false);
    act(() => renderer.unmount());
  });

  it('구독할 수 있는 카드는 검정 알약 [구독하기]이고, 기능 줄·광고 표기가 없다', () => {
    // given · when
    const renderer = renderList([FREE_CURRENT, PAID_PURCHASE]);

    // then
    const buttons = renderer.root.findAll(
      (node) => typeof node.type !== 'string' && node.props.accessibilityLabel === '매일 구독하기',
    );
    expect(buttons.length).toBeGreaterThan(0);
    const style = flat(
      (buttons[0].props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
    );
    expect(style.borderRadius).toBe(theme.radius.full);
    expect(style.borderCurve).toBe('continuous');
    expect(style.backgroundColor).toBe(theme.color.primary);
    const texts = allText(renderer);
    expect(texts.some((text) => text.includes('광고'))).toBe(false);
    expect(texts.some((text) => text.includes('이어 PICK'))).toBe(false);
    act(() => renderer.unmount());
  });

  it('현재 구독 정보는 이용 중 카드 안에 그린다', () => {
    // given
    const detail = <RNText testID="current-detail">다음 결제일 11월 1일</RNText>;

    // when
    const renderer = renderList([FREE_CURRENT, PAID_PURCHASE], detail);

    // then
    expect(
      renderer.root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === 'current-detail',
      ),
    ).toHaveLength(1);
    act(() => renderer.unmount());
  });

  it('서버가 current 카드를 주지 않으면 [이용 중]도 구독 정보도 그리지 않는다(지금 서버 — 무료 none)', () => {
    // given
    const freeNone = makeCard(
      { tier: 'light', name: '가벼운', action: 'none' },
      SUBSCRIPTION_COPY.plans.freePrice,
    );
    const detail = <RNText testID="current-detail">정보</RNText>;

    // when
    const renderer = renderList([freeNone, PAID_PURCHASE], detail);

    // then
    expect(textNodes(renderer, SUBSCRIPTION_COPY.plans.current)).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === 'current-detail',
      ),
    ).toHaveLength(0);
    act(() => renderer.unmount());
  });
});
