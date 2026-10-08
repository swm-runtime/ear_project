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

const PAID_UPGRADE = makeCard(
  {
    tier: 'pro',
    name: '무제한',
    description: '제한 없이 마음껏 들을 수 있어요',
    storeProductId: 'pro.monthly',
    action: 'purchase',
  },
  '₩9,900',
);

const renderList = (cards: PlanCardVM[], currentDetail?: ReactNode, onPurchase = jest.fn()) =>
  render(
    <PlanList
      state={{ kind: 'ready', cards, isEmailVerified: true }}
      isBusy={false}
      purchasingPlanId={null}
      onPurchase={onPurchase}
      onRetry={jest.fn()}
      isRetrying={false}
      currentDetail={currentDetail}
    />,
  );

/** 누를 수 있는 노드(합성 컴포넌트) — accessibilityRole 로 찾는다 */
const byRole = (renderer: Renderer, role: string) =>
  renderer.root.findAll(
    (node) => typeof node.type !== 'string' && node.props.accessibilityRole === role,
  );

const radioOf = (renderer: Renderer, name: string) =>
  byRole(renderer, 'radio').filter((node) =>
    String(node.props.accessibilityLabel).startsWith(name),
  )[0];

const ctaOf = (renderer: Renderer, label: string) =>
  renderer.root.findAll(
    (node) => typeof node.type !== 'string' && node.props.accessibilityLabel === label,
  );

describe('PlanList — 요금제 카드(KAN-146)', () => {
  it('이용 중 카드는 회색 단계로 내리고 이름 옆 [이용 중] 배지를 둔다 — 라디오도 버튼도 아니다', () => {
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
    expect(radioOf(renderer, '가벼운')).toBeUndefined();
    expect(
      byRole(renderer, 'button').some((node) =>
        String(node.props.accessibilityLabel).includes('이용 중'),
      ),
    ).toBe(false);
    act(() => renderer.unmount());
  });

  it('고를 수 있는 첫 카드가 기본 선택이고, 목록 아래 검정 알약 하나가 "<이름> 구독하기"다', () => {
    // given · when
    const renderer = renderList([FREE_CURRENT, PAID_PURCHASE, PAID_UPGRADE]);

    // then
    expect(radioOf(renderer, '매일').props.accessibilityState).toMatchObject({ selected: true });
    expect(radioOf(renderer, '무제한').props.accessibilityState).toMatchObject({
      selected: false,
    });
    // 버튼은 하나 — 합성 컴포넌트가 겹쳐 노드는 여럿일 수 있어 이름으로 센다
    expect(new Set(byRole(renderer, 'button').map((node) => node.props.accessibilityLabel))).toEqual(
      new Set(['매일 구독하기']),
    );
    const cta = ctaOf(renderer, '매일 구독하기');
    expect(cta.length).toBeGreaterThan(0);
    const style = flat(
      (cta[0].props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
    );
    expect(style.borderRadius).toBe(theme.radius.full);
    expect(style.borderCurve).toBe('continuous');
    expect(style.backgroundColor).toBe(theme.color.primary);
    const texts = allText(renderer);
    expect(texts.some((text) => text.includes('광고'))).toBe(false);
    expect(texts.some((text) => text.includes('이어 PICK'))).toBe(false);
    act(() => renderer.unmount());
  });

  it('다른 카드를 누르면 고르기만 하고, 버튼을 눌러야 그 요금제로 결제를 연다', () => {
    // given
    const onPurchase = jest.fn();
    const renderer = renderList([FREE_CURRENT, PAID_PURCHASE, PAID_UPGRADE], undefined, onPurchase);

    // when
    act(() => {
      (radioOf(renderer, '무제한').props.onPress as () => void)();
    });

    // then
    expect(onPurchase).not.toHaveBeenCalled();
    expect(radioOf(renderer, '무제한').props.accessibilityState).toMatchObject({ selected: true });
    const cta = ctaOf(renderer, '무제한 구독하기');
    expect(cta.length).toBeGreaterThan(0);
    act(() => {
      (cta[0].props.onPress as () => void)();
    });
    expect(onPurchase).toHaveBeenCalledWith(PAID_UPGRADE.plan);
    act(() => renderer.unmount());
  });

  it('변경(다운그레이드)을 고르면 보조 버튼 "<이름>(으)로 변경"과 적용 시점 안내를 둔다', () => {
    // given — 받침 있는 이름은 "으로"
    const downgrade = makeCard(
      { tier: 'light', name: '가벼운', storeProductId: 'light.monthly', action: 'downgrade' },
      '₩1,900',
    );
    const current = makeCard({ tier: 'pro', name: '무제한', action: 'current' }, '₩9,900');

    // when
    const renderer = renderList([downgrade, current]);

    // then
    const cta = ctaOf(renderer, '가벼운으로 변경');
    expect(cta.length).toBeGreaterThan(0);
    const style = flat(
      (cta[0].props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
    );
    expect(style.backgroundColor).toBe(theme.color.background);
    expect(textNodes(renderer, SUBSCRIPTION_COPY.plans.downgradeHint)).toHaveLength(1);
    act(() => renderer.unmount());
  });

  describe('해지 예약 중 — 이용 중 카드를 골라 [구독 다시 시작](PM 2026-10-08)', () => {
    const LIGHT_NONE = makeCard(
      { tier: 'light', name: '가벼운', action: 'none' },
      SUBSCRIPTION_COPY.plans.freePrice,
    );
    const DAILY_DOWN = makeCard(
      { tier: 'daily', name: '매일', storeProductId: 'daily.monthly', action: 'downgrade' },
      '₩3,900',
    );
    const PRO_CURRENT = makeCard({ tier: 'pro', name: '무제한', action: 'current' }, '₩9,900');

    const renderResume = (onResume = jest.fn()) =>
      render(
        <PlanList
          state={{ kind: 'ready', cards: [LIGHT_NONE, DAILY_DOWN, PRO_CURRENT], isEmailVerified: true }}
          isBusy={false}
          purchasingPlanId={null}
          onPurchase={jest.fn()}
          onResume={onResume}
          onRetry={jest.fn()}
          isRetrying={false}
        />,
      );

    it('이용 중 카드가 기본 선택이고 아래 버튼은 [구독 다시 시작] — 누르면 onResume', () => {
      // given
      const onResume = jest.fn();
      const renderer = renderResume(onResume);

      // when
      const cta = ctaOf(renderer, SUBSCRIPTION_COPY.manage.resume);
      act(() => (cta[0].props.onPress as () => void)());

      // then
      expect(radioOf(renderer, '무제한').props.accessibilityState).toMatchObject({ selected: true });
      expect(onResume).toHaveBeenCalledTimes(1);
      act(() => renderer.unmount());
    });

    it('고를 수 없는 카드도 라디오 원은 그린다(흐린 빈 원) — 칸만 비우지 않는다', () => {
      // when
      const renderer = renderResume();

      // then — 라디오 역할은 고를 수 있는 카드에만, 원은 세 카드 모두
      expect(radioOf(renderer, '가벼운')).toBeUndefined();
      const circles = renderer.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          flat(node.props.style).width === 22 &&
          flat(node.props.style).borderWidth === 2,
      );
      expect(circles).toHaveLength(3);
      act(() => renderer.unmount());
    });
  });

  describe('무료 요금제로 바꾸기(cancel — PM 2026-10-08)', () => {
    const FREE_CANCEL = makeCard(
      { tier: 'light', name: '가벼운', description: '하루 2편까지 들을 수 있어요', action: 'cancel' },
      SUBSCRIPTION_COPY.plans.freePrice,
    );
    const PAID_DOWNGRADE = makeCard(
      { tier: 'daily', name: '매일', storeProductId: 'daily.monthly', action: 'downgrade' },
      '₩3,900',
    );
    const PRO_CURRENT = makeCard({ tier: 'pro', name: '무제한', action: 'current' }, '₩9,900');
    const HINT = '지금 요금제는 10월 8일까지 이용할 수 있어요';

    const renderManage = (onCancel = jest.fn(), onPurchase = jest.fn()) =>
      render(
        <PlanList
          state={{
            kind: 'ready',
            cards: [FREE_CANCEL, PAID_DOWNGRADE, PRO_CURRENT],
            isEmailVerified: true,
          }}
          isBusy={false}
          purchasingPlanId={null}
          onPurchase={onPurchase}
          onCancel={onCancel}
          cancelHint={HINT}
          onRetry={jest.fn()}
          isRetrying={false}
        />,
      );

    it('기본 선택은 유료 카드다 — 무료로 바꾸기는 직접 골라야만 선택된다', () => {
      // when
      const renderer = renderManage();

      // then
      expect(radioOf(renderer, '매일').props.accessibilityState).toMatchObject({ selected: true });
      expect(radioOf(renderer, '가벼운').props.accessibilityState).toMatchObject({
        selected: false,
      });
      act(() => renderer.unmount());
    });

    it('무료 카드를 고르면 보조 버튼 "<이름>(으)로 변경"과 이용 기한 안내, 누르면 해지 경로(onCancel)를 연다', () => {
      // given
      const onCancel = jest.fn();
      const onPurchase = jest.fn();
      const renderer = renderManage(onCancel, onPurchase);

      // when
      act(() => (radioOf(renderer, '가벼운').props.onPress as () => void)());
      const cta = ctaOf(renderer, '가벼운으로 변경');
      act(() => (cta[0].props.onPress as () => void)());

      // then
      const style = flat(
        (cta[0].props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
      );
      expect(style.backgroundColor).toBe(theme.color.background);
      expect(textNodes(renderer, HINT)).toHaveLength(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onPurchase).not.toHaveBeenCalled();
      act(() => renderer.unmount());
    });

    it('해지 경로를 받지 않은 화면(페이월)에서는 무료 카드를 고를 수 없다', () => {
      // when
      const renderer = renderList([FREE_CANCEL, PAID_DOWNGRADE, PRO_CURRENT]);

      // then
      expect(radioOf(renderer, '가벼운')).toBeUndefined();
      expect(ctaOf(renderer, '가벼운으로 변경')).toHaveLength(0);
      act(() => renderer.unmount());
    });
  });

  it('조사는 이름 마지막 글자로 고른다 — 받침 없음·ㄹ 받침·영문은 "로"', () => {
    expect(SUBSCRIPTION_COPY.plans.cta('Daily', 'downgrade')).toBe('Daily로 변경');
    expect(SUBSCRIPTION_COPY.plans.cta('매일', 'downgrade')).toBe('매일로 변경');
    expect(SUBSCRIPTION_COPY.plans.cta('베이직', 'downgrade')).toBe('베이직으로 변경');
    expect(SUBSCRIPTION_COPY.plans.cta('Pro', 'upgrade')).toBe('Pro 업그레이드');
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
    expect(radioOf(renderer, '가벼운')).toBeUndefined();
    expect(
      renderer.root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === 'current-detail',
      ),
    ).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('고를 수 있는 카드가 없으면(다른 스토어 구독 등) 버튼을 그리지 않는다', () => {
    // given
    const otherStore = makeCard(
      { tier: 'daily', name: '매일', storeProductId: 'daily.monthly', action: 'none' },
      '₩3,900',
    );

    // when
    const renderer = renderList([otherStore]);

    // then
    expect(byRole(renderer, 'button')).toHaveLength(0);
    expect(byRole(renderer, 'radio')).toHaveLength(0);
    act(() => renderer.unmount());
  });
});
