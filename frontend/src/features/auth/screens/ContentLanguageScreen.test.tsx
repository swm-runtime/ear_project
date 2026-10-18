import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { CONTENT_LANGUAGE_COPY } from '../auth.copy';
import type { AuthStackParamList } from '../auth.types';
import ContentLanguageScreen from './ContentLanguageScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    popToTop: jest.fn(),
    goBack: jest.fn(),
    isFocused: () => true,
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/shared/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/shared/ui/toast.store', () => ({
  useToastStore: (selector: (state: { show: () => void }) => unknown) =>
    selector({ show: jest.fn() }),
}));
jest.mock('../hooks/useSignUpConsentsMutation', () => ({
  useSignUpConsentsMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
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

type Props = NativeStackScreenProps<AuthStackParamList, 'ContentLanguage'>;
const PROPS = {
  route: { params: { signupToken: 'signup-1', requiredConsents: [] } },
  navigation: {},
} as unknown as Props;

let renderer: Renderer | null = null;
beforeEach(() => {
  act(() => {
    renderer = create(<ContentLanguageScreen {...PROPS} />);
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

const root = () => (renderer as Renderer).root;
const isHost = (node: Node) => typeof node.type === 'string';
const textOf = (node: Node) => [node.props.children].flat().join('');

/** 낭독에서 빠지지 않고 투명하지 않은 글자 — 사용자가 보고 듣는 문구 */
const visibleTexts = (): string[] =>
  root()
    .findAll((node) => isHost(node) && node.type === 'Text')
    .filter(
      (node) =>
        node.props.accessibilityElementsHidden !== true &&
        StyleSheet.flatten(node.props.style as StyleProp<TextStyle>)?.opacity !== 0,
    )
    .map(textOf);

/** 선택지 카드(라디오) — 낭독 이름은 그 언어 자신의 표기다 */
const card = (label: string) =>
  root().findAll(
    (node) =>
      node.props.accessibilityRole === 'radio' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0] as Node;

const select = (label: string) => {
  act(() => {
    (card(label).props.onPress as () => void)();
  });
};

const KO = CONTENT_LANGUAGE_COPY.ko;
const EN = CONTENT_LANGUAGE_COPY.en;
const KOREAN = KO.option.ko;
const ENGLISH = KO.option.en;

describe('A21 — 화면 문구는 고른 선택지의 언어를 따른다(PM 2026-10-19)', () => {
  it('처음에는 기본 선택(표시 언어 = 한국어)의 문구로 그린다', () => {
    // given — jest 의 표시 언어는 한국어(jest.setup.js)

    // then
    const texts = visibleTexts();
    expect(texts).toEqual(
      expect.arrayContaining([KO.title, KO.description, KO.notChangeable, KO.next]),
    );
    expect(texts).not.toContain(EN.title);
    expect(card(KOREAN).props.accessibilityState).toEqual({ checked: true });
  });

  it('English 를 고르면 제목·설명·변경 불가·버튼이 영어로 바뀐다', () => {
    // when
    select(ENGLISH);

    // then
    const texts = visibleTexts();
    expect(texts).toEqual(
      expect.arrayContaining([EN.title, EN.description, EN.notChangeable, EN.next]),
    );
    expect(texts).not.toContain(KO.title);
    expect(texts).not.toContain(KO.next);
    expect(card(ENGLISH).props.accessibilityState).toEqual({ checked: true });
  });

  it('English 에서 한국어로 다시 고르면 한국어 문구로 돌아온다', () => {
    // given
    select(ENGLISH);

    // when
    select(KOREAN);

    // then
    const texts = visibleTexts();
    expect(texts).toEqual(expect.arrayContaining([KO.title, KO.notChangeable, KO.next]));
    expect(texts).not.toContain(EN.title);
  });

  it('제목(header)은 보이는 언어 겹 하나만이고, 그 언어 목소리로 읽힌다', () => {
    // when
    select(ENGLISH);

    // then
    const headers = root().findAll(
      (node) => isHost(node) && node.props.accessibilityRole === 'header',
    );
    expect(headers.map(textOf)).toEqual([EN.title]);
    expect(headers[0]?.props.accessibilityLanguage).toBe('en-US');
  });

  it('선택지 이름과 영어 사용자에게 하는 두 줄은 화면 언어와 무관하게 같다', () => {
    for (const label of [KOREAN, ENGLISH]) {
      // when
      select(label);

      // then — 이름은 그 언어 자신의 표기, English 설명·권장은 늘 영어
      expect(visibleTexts()).toEqual(
        expect.arrayContaining([
          KOREAN,
          ENGLISH,
          'Learn Korea with K-podcast',
          'Into K-culture? Choose English',
        ]),
      );
      expect(card(ENGLISH).props.accessibilityHint).toBe('Learn Korea with K-podcast');
      expect(card(KOREAN).props.accessibilityLanguage).toBe('ko-KR');
      expect(card(ENGLISH).props.accessibilityLanguage).toBe('en-US');
    }
  });

  it('한국어 선택지 설명은 고른 언어를 따른다', () => {
    // given — 기본 선택(한국어)에서는 한국어 설명
    expect(card(KOREAN).props.accessibilityHint).toBe(KO.optionDescription.ko);

    // when
    select(ENGLISH);

    // then
    expect(card(KOREAN).props.accessibilityHint).toBe(EN.optionDescription.ko);
  });
});

describe('A21 — 카드 뒤 흐린 국기(PM 2026-10-19)', () => {
  it('한국어 = 태극기, English = 성조기를 카드마다 깔고, 장식이라 낭독·초점에서 빠진다', () => {
    for (const language of ['ko', 'en'] as const) {
      // when
      const [flag] = root().findAll(
        (node) => isHost(node) && node.props.testID === `language-flag-${language}`,
      );

      // then
      expect(flag).toBeDefined();
      expect(flag?.props.accessible).toBe(false);
      expect(flag?.props.accessibilityElementsHidden).toBe(true);
      expect(flag?.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });
});
