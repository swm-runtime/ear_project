import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';

import { SUBSCRIPTION_COPY } from '../subscription.copy';
import SubscriptionLegalNotice from './SubscriptionLegalNotice';

/** 세션 사용자의 시장 — 테스트마다 바꾼다. auth 공개 API 는 네이티브 의존을 끌어와 selector 만 흉내 낸다 */
let mockMarket: 'kr' | 'global' = 'kr';
jest.mock('@/features/auth', () => ({
  useSessionStore: (selector: (state: { user: { market: 'kr' | 'global' } }) => unknown) =>
    selector({ user: { market: mockMarket } }),
  selectMarket: (state: { user: { market: 'kr' | 'global' } | null }) => state.user?.market ?? 'kr',
}));

afterEach(() => {
  mockMarket = 'kr';
});

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

/** 화면에 그려진 고지 항목 — 글머리·링크를 뺀 본문 줄 */
const legalItemTexts = (renderer: Renderer): string[] =>
  renderer.root
    .findAll(
      (node) =>
        node.type === RNText &&
        typeof node.props.children === 'string' &&
        node.props.lineBreakStrategyIOS === 'hangul-word',
    )
    .map((node) => node.props.children as string);

describe('SubscriptionLegalNotice — 시장별 자동 갱신 고지(KAN-196)', () => {
  it('KR 계정은 종전 고지(전자상거래법 겸용 PM 확정 문구)를 그대로 그린다', () => {
    // given
    mockMarket = 'kr';

    // when
    const renderer = render(
      <SubscriptionLegalNotice onRestore={jest.fn()} isRestoreDisabled={false} isRestoring={false} />,
    );

    // then — 테스트 환경은 iOS
    expect(legalItemTexts(renderer)).toEqual([...SUBSCRIPTION_COPY.legal.ios]);
    act(() => renderer.unmount());
  });

  it('GLOBAL 계정은 Apple·Google 표준 고지를 그린다 — 표시 언어가 아니라 시장으로 고른다', () => {
    // given
    mockMarket = 'global';

    // when
    const renderer = render(
      <SubscriptionLegalNotice onRestore={jest.fn()} isRestoreDisabled={false} isRestoring={false} />,
    );

    // then
    const texts = legalItemTexts(renderer);
    expect(texts).toEqual([...SUBSCRIPTION_COPY.legal.global.ios]);
    expect(texts).not.toEqual([...SUBSCRIPTION_COPY.legal.ios]);
    act(() => renderer.unmount());
  });
});
