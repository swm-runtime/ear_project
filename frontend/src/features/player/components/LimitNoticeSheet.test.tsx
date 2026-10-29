/**
 * KAN-294 — 잠금 시트(PW2). 한도 시트와 같은 자리지만 머리에 남은 횟수 링 대신 자물쇠, 제목·설명은 잠금 문구다.
 * 구독 UI 가 꺼진 빌드는 구독을 언급하지 않는다 — 서버 문구("프로 구독")도 쓰지 않는다(App Store 2.1(b)).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

import { PLAYER_COPY } from '../player.copy';
import LimitNoticeSheet from './LimitNoticeSheet';
import { useLimitNoticeStore } from '../store/limit-notice.store';

const mockFlag = { subscriptionUi: true };
jest.mock('@/shared/lib/feature-flags', () => ({
  get IS_SUBSCRIPTION_UI_ENABLED() {
    return mockFlag.subscriptionUi;
  },
}));
// 요금제 비교·결제는 subscription 의 몫 — 얹혔는지만 본다
jest.mock('@/features/subscription', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PaywallPlansSection: () => <Text>PLANS</Text>,
    useIsPurchaseInProgress: () => false,
  };
});
// 공용 시트 셸(모달·모션) 대신 내용만 그린다
jest.mock(
  '@/shared/ui/BottomSheet',
  () =>
    ({ isVisible, children }: { isVisible: boolean; children: ReactNode }) =>
      isVisible ? children : null,
);

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

const render = () => {
  let renderer!: Renderer;
  act(() => {
    renderer = create(<LimitNoticeSheet />);
  });
  return renderer;
};
const texts = (renderer: Renderer): string[] =>
  renderer.root
    .findAll((node) => node.type === 'Text')
    .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string'));
const byTestId = (renderer: Renderer, testID: string) =>
  renderer.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID);

beforeEach(() => {
  mockFlag.subscriptionUi = true;
  useLimitNoticeStore.getState().hide();
});

describe('LimitNoticeSheet — 잠금 시트(KAN-294)', () => {
  it('구독 UI 가 켜진 빌드면 자물쇠 + 앱 카피 제목 + 잠금 설명 + 요금제가 얹히고 서버 문구·남은 횟수 링은 없다', () => {
    // given
    act(() =>
      useLimitNoticeStore.getState().showSeriesLock('이 편은 프로 구독에서 들을 수 있어요', null),
    );

    // when
    const renderer = render();

    // then
    expect(byTestId(renderer, 'limit-notice-lock')).toHaveLength(1);
    const shown = texts(renderer);
    expect(shown).toContain(PLAYER_COPY.seriesLock.title);
    expect(shown).not.toContain('이 편은 프로 구독에서 들을 수 있어요');
    expect(shown).toContain(PLAYER_COPY.seriesLock.description);
    expect(shown).toContain('PLANS');
    expect(shown).not.toContain(PLAYER_COPY.limitNotice.title);
    expect(shown).not.toContain(PLAYER_COPY.limitNotice.description);
    renderer.unmount();
  });

  it('서버 문구 없이(미리 막기) 열리면 확정 카피 제목을 쓴다', () => {
    act(() => useLimitNoticeStore.getState().showSeriesLock(null, null));

    const renderer = render();

    expect(texts(renderer)).toContain(PLAYER_COPY.seriesLock.title);
    renderer.unmount();
  });

  it('구독 UI 가 꺼진 빌드면 구독을 언급하지 않는 문구와 [확인]만 — 서버 문구·요금제를 그리지 않는다', () => {
    // given
    mockFlag.subscriptionUi = false;
    act(() =>
      useLimitNoticeStore.getState().showSeriesLock('이 편은 프로 구독에서 들을 수 있어요', null),
    );

    // when
    const renderer = render();

    // then
    const shown = texts(renderer);
    expect(shown).toContain(PLAYER_COPY.seriesLock.unavailableTitle);
    expect(shown).toContain(PLAYER_COPY.seriesLock.unavailableDescription);
    expect(shown).toContain(PLAYER_COPY.limitNotice.confirm);
    expect(shown).not.toContain('이 편은 프로 구독에서 들을 수 있어요');
    expect(shown).not.toContain('PLANS');
    renderer.unmount();
  });

  it('한도로 열린 시트는 종전 그대로 링이고 자물쇠가 없다', () => {
    act(() => useLimitNoticeStore.getState().showPaywall(null, null, null));

    const renderer = render();

    expect(byTestId(renderer, 'limit-notice-lock')).toHaveLength(0);
    expect(texts(renderer)).toContain(PLAYER_COPY.limitNotice.title);
    renderer.unmount();
  });
});
