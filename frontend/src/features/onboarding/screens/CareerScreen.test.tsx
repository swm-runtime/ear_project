import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { ONBOARDING_COPY } from '../onboarding.copy';
import CareerScreen from './CareerScreen';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
// onboarding 카피가 알림 feature 의 공개 API 를 거쳐 알림 카피를 읽는다 — 무거운 네이티브 의존을 피해 카피만 꺼내 준다
jest.mock('@/features/notification', () => ({
  NOTIFICATION_COPY: jest.requireActual<{ NOTIFICATION_COPY: unknown }>(
    '@/features/notification/notification.copy',
  ).NOTIFICATION_COPY,
}));
// 폼 부품은 커리어 정보 화면 소유 — 이 테스트는 배치(무엇이 스크롤 안에 있는가)만 본다
jest.mock('@/features/career', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    JOB_CHIP_HEIGHT: 56,
    JOB_CHIP_RADIUS: 24,
    JobCategoryChips: () => <View testID="job-category-chips" />,
    JobTitleField: () => <View testID="job-title-field" />,
    YearsSegment: () => <View testID="years-segment" />,
  };
});
jest.mock('../hooks/useCareerScreen', () => ({
  useCareerScreen: () => ({
    stepPosition: { current: 2, total: 2 },
    jobCategory: null,
    jobTitle: '',
    yearsOfExperience: null,
    jobCategoryOptions: [],
    isJobCategoriesLoading: false,
    showJobCategoriesSkeleton: false,
    isJobCategoriesError: false,
    retryJobCategories: jest.fn(),
    setJobCategory: jest.fn(),
    setJobTitle: jest.fn(),
    setYearsOfExperience: jest.fn(),
    isNextSubmitting: false,
    isSkipSubmitting: false,
    isSubmitting: false,
    handleNextPress: jest.fn(),
    handleSkipPress: jest.fn(),
    handleBackPress: jest.fn(),
  }),
}));

interface Node {
  type: unknown;
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
beforeEach(() => {
  act(() => {
    renderer = create(<CareerScreen />);
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

const scrollView = () => {
  const found = renderer!.root.findAll((node) => node.type === ScrollView);
  expect(found).toHaveLength(1);
  return found[0];
};
const hasText = (node: Node, text: string) =>
  node.findAll((child) => child.props.children === text).length > 0;
const hasLabel = (node: Node, label: string) =>
  node.findAll((child) => child.props.accessibilityLabel === label).length > 0;

describe('CareerScreen', () => {
  describe('넘칠 때의 스크롤 (KAN-197)', () => {
    it('헤드라인·안내·폼이 스크롤 안에 있으면 큰 글자에서 머리가 화면을 먹어도 폼에 닿는다', () => {
      // given / when — 화면을 그리면
      const scroll = scrollView();

      // then
      expect(hasText(scroll, ONBOARDING_COPY.career.title)).toBe(true);
      expect(hasText(scroll, ONBOARDING_COPY.career.laterNotice)).toBe(true);
      expect(scroll.findAll((node) => node.props.testID === 'years-segment')).not.toHaveLength(0);
    });

    it('툴바([건너뛰기])와 하단 [다음]은 스크롤 밖에 고정된다', () => {
      // given / when
      const scroll = scrollView();

      // then
      expect(hasLabel(scroll, ONBOARDING_COPY.career.skip)).toBe(false);
      expect(hasLabel(scroll, ONBOARDING_COPY.career.next)).toBe(false);
      expect(hasLabel(renderer!.root, ONBOARDING_COPY.career.next)).toBe(true);
    });

    it('키보드가 떠 있으면 입력칸을 올리고 칩·연차는 한 번에 눌린다', () => {
      // given / when
      const { props } = scrollView();

      // then
      expect(props.automaticallyAdjustKeyboardInsets).toBe(true);
      expect(props.keyboardShouldPersistTaps).toBe('handled');
    });
  });
});
