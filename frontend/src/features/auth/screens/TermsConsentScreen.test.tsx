import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';
import { AccessibilityInfo, ScrollView } from 'react-native';

import { SCROLL_END_THRESHOLD } from '@/shared/hooks/useScrollEndGate';

import { AUTH_COPY } from '../auth.copy';
import type { AuthStackParamList } from '../auth.types';
import TermsConsentScreen from './TermsConsentScreen';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
// 화면 훅은 필수 체크가 끝난 상태로 고정한다 — 이 테스트는 스크롤 끝 관문만 본다
let mockCanSubmit = true;
jest.mock('../hooks/useTermsConsentScreen', () => ({
  useTermsConsentScreen: () => ({
    items: [],
    isAllChecked: mockCanSubmit,
    canSubmit: mockCanSubmit,
    isSubmitting: false,
    toggleConsent: jest.fn(),
    toggleAll: jest.fn(),
    handleViewPress: jest.fn(),
    handleSubmit: jest.fn(),
  }),
}));

interface Node {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: Node) => boolean): Node[];
  findByType(type: unknown): Node;
}
interface Renderer {
  root: Node;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void>;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

type Props = NativeStackScreenProps<AuthStackParamList, 'TermsConsent'>;
const PROPS = {
  route: {
    params: { signupToken: 'signup-1', requiredConsents: [], preferredLanguage: 'en' },
  },
  navigation: { goBack: jest.fn() },
} as unknown as Props;

const VIEWPORT = 500;

let renderer: Renderer | null = null;
let screenReaderListener: ((enabled: boolean) => void) | null = null;

async function renderScreen({ screenReader = false } = {}) {
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockImplementation(() => Promise.resolve(screenReader));
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    _event: string,
    listener: (enabled: boolean) => void,
  ) => {
    screenReaderListener = listener;
    return { remove: jest.fn() };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  await act(async () => {
    renderer = create(<TermsConsentScreen {...PROPS} />);
  });
}

const root = () => (renderer as Renderer).root;
const scrollProps = () =>
  root().findByType(ScrollView).props as {
    onLayout(event: unknown): void;
    onContentSizeChange(width: number, height: number): void;
    onScroll(event: unknown): void;
  };

/** 보이는 칸과 내용 높이를 ScrollView 가 알려 온 것처럼 흘린다 */
async function measure(contentHeight: number) {
  await act(async () => {
    scrollProps().onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 345, height: VIEWPORT } },
    });
    scrollProps().onContentSizeChange(345, contentHeight);
  });
}

async function scrollTo(offsetY: number, contentHeight: number) {
  await act(async () => {
    scrollProps().onScroll({
      nativeEvent: {
        contentOffset: { x: 0, y: offsetY },
        layoutMeasurement: { width: 345, height: VIEWPORT },
        contentSize: { width: 345, height: contentHeight },
      },
    });
  });
}

/** [동의하고 시작하기] — Pressable(합성 컴포넌트)의 disabled */
const isSubmitDisabled = () => {
  const [button] = root().findAll(
    (node) =>
      typeof node.type !== 'string' && node.props.accessibilityLabel === AUTH_COPY.consent.submit,
  );
  return button.props.disabled === true;
};
const isHintShown = () =>
  root().findAll(
    (node) =>
      typeof node.type === 'string' &&
      [node.props.children].flat().join('') === AUTH_COPY.consent.readToEnd,
  ).length > 0;

beforeEach(() => {
  mockCanSubmit = true;
  screenReaderListener = null;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  jest.restoreAllMocks();
});

describe('TermsConsentScreen — 스크롤 끝 관문', () => {
  it('내용이 화면에 다 들어가면 스크롤 없이 바로 버튼이 열리고 안내를 띄우지 않는다', async () => {
    // given
    await renderScreen();

    // when — flexGrow 로 내용이 보이는 칸과 같은 높이다(짧은 한국어 목록)
    await measure(VIEWPORT);

    // then
    expect([isSubmitDisabled(), isHintShown()]).toEqual([false, false]);
  });

  it('내용이 길면 끝까지 내리기 전에는 필수를 다 체크해도 버튼이 닫혀 있고 안내가 보인다', async () => {
    // given
    await renderScreen();

    // when — 중간까지만 내린다
    await measure(VIEWPORT + 400);
    await scrollTo(200, VIEWPORT + 400);

    // then
    expect([isSubmitDisabled(), isHintShown()]).toEqual([true, true]);
  });

  it('끝(여유 안)까지 내리면 버튼이 열리고 다시 올려도 닫히지 않는다', async () => {
    // given
    await renderScreen();
    await measure(VIEWPORT + 400);

    // when — 끝에서 여유보다 조금 덜 남기고 닿은 뒤 다시 맨 위로
    await scrollTo(400 - SCROLL_END_THRESHOLD + 1, VIEWPORT + 400);
    await scrollTo(0, VIEWPORT + 400);

    // then
    expect([isSubmitDisabled(), isHintShown()]).toEqual([false, false]);
  });

  it('스크롤로 끝에 닿아 열린 뒤에는 목록이 길어져도(재조회·글자 크기 변경) 닫히지 않는다', async () => {
    // given
    await renderScreen();
    await measure(VIEWPORT + 400);
    await scrollTo(400, VIEWPORT + 400);

    // when
    await measure(VIEWPORT + 800);

    // then
    expect(isSubmitDisabled()).toBe(false);
  });

  it('첫 측정에서 다 들어가 보였어도 내용이 길어지면 끝까지 내리기 전에는 다시 닫힌다', async () => {
    // given — 첫 레이아웃 패스의 짧은 높이(목록이 다 그려지기 전)
    await renderScreen();
    await measure(VIEWPORT);

    // when — 실제 목록은 스크롤되는 길이다
    await measure(VIEWPORT + 400);

    // then
    expect([isSubmitDisabled(), isHintShown()]).toEqual([true, true]);
  });

  it('스크린리더가 켜져 있으면 끝까지 내리지 않아도 버튼이 열린다', async () => {
    // given
    await renderScreen({ screenReader: true });

    // when
    await measure(VIEWPORT + 400);

    // then
    expect([isSubmitDisabled(), isHintShown()]).toEqual([false, false]);
  });

  it('화면을 보는 중에 스크린리더를 켜면 그때부터 면제된다', async () => {
    // given
    await renderScreen();
    await measure(VIEWPORT + 400);

    // when
    await act(async () => screenReaderListener?.(true));

    // then
    expect(isSubmitDisabled()).toBe(false);
  });

  it('끝까지 내려도 필수 항목을 체크하지 않았으면 버튼은 닫혀 있다', async () => {
    // given
    mockCanSubmit = false;
    await renderScreen();
    await measure(VIEWPORT);

    // then
    expect([isSubmitDisabled(), isHintShown()]).toEqual([true, false]);
  });
});
