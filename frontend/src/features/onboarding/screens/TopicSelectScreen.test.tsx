import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

import TopicSelectScreen from './TopicSelectScreen';

const mockNavigate = jest.fn();
let mockRevertTarget: 'kr' | 'global' | null = null;

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
// onboarding 카피가 알림 feature 의 공개 API 를 거쳐 알림 카피를 읽는다 — 무거운 네이티브 의존을 피해 카피만 꺼내 준다
jest.mock('@/features/notification', () => ({
  NOTIFICATION_COPY: jest.requireActual<{ NOTIFICATION_COPY: unknown }>(
    '@/features/notification/notification.copy',
  ).NOTIFICATION_COPY,
}));
jest.mock('@/features/auth', () => ({
  getMarketChangeRevertTarget: () => mockRevertTarget,
}));
jest.mock('@/features/interest', () => ({ topicImageSource: () => ({ uri: 'topic.jpg' }) }));
jest.mock('@/shared/ui/GlassIconButton', () => {
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: { onPress: () => void; accessibilityLabel: string; children: ReactNode }) => (
      <Pressable onPress={props.onPress} accessibilityLabel={props.accessibilityLabel}>
        {props.children}
      </Pressable>
    ),
  };
});
jest.mock('../components/TopicMarqueeRow', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/TopicSelectSkeleton', () => ({ TopicPillRowsSkeleton: () => null }));
jest.mock('../hooks/useTopicSelectScreen', () => ({
  useTopicSelectScreen: () => ({
    stepPosition: { current: 1, total: 1 },
    topics: [],
    maxSelectable: 3,
    selectedCount: 0,
    canGoNext: false,
    isSubmitting: false,
    showSkeleton: false,
    isLoading: false,
    isUnavailable: false,
    isEmpty: false,
    isRefetching: false,
    refetch: jest.fn(),
    toggleTopic: jest.fn(),
    handleNextPress: jest.fn(),
  }),
}));

interface Node {
  props: Record<string, unknown>;
  findAll(predicate: (node: Node) => boolean): Node[];
}
interface Renderer {
  root: Node;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void): void;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

let renderer: Renderer | null = null;
const render = () => {
  act(() => {
    renderer = create(<TopicSelectScreen />);
  });
};
const byLabel = (label: string) =>
  renderer!.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRevertTarget = null;
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe('TopicSelectScreen — 시장 전환 뒤 되돌리기(KAN-228)', () => {
  it('재온보딩이면 왼쪽 위 되돌리기 버튼이 있고, 누르면 직전 언어로 전환 화면을 연다', () => {
    // given — KR → GLOBAL 전환 직후(직전 시장 kr)
    mockRevertTarget = 'kr';

    // when
    render();
    const buttons = byLabel('한국어 콘텐츠로 되돌리기');

    // then
    expect(buttons.length).toBeGreaterThan(0);
    act(() => (buttons[0].props.onPress as () => void)());
    expect(mockNavigate).toHaveBeenCalledWith('MarketChange', { targetLanguage: 'ko' });
  });

  it('첫 가입·되돌린 뒤에는 버튼이 없다 — 1단계라 되돌아갈 곳이 없다', () => {
    // given
    mockRevertTarget = null;

    // when
    render();

    // then
    expect(byLabel('한국어 콘텐츠로 되돌리기')).toHaveLength(0);
    expect(byLabel('영어 콘텐츠로 되돌리기')).toHaveLength(0);
  });
});
