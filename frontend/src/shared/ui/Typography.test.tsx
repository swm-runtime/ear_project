import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import {
  Animated,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
} from 'react-native';

import { AndroidFontsLoaded } from '@/shared/theme/FontProvider.android';

import * as SystemTypography from './Typography';
import { Text, TextInput, AnimatedText } from './Typography.android';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다.
interface TestNode {
  props: { testID?: string; style: import('react-native').TextStyle };
  findAllByType(type: unknown): TestNode[];
  findByType(type: unknown): TestNode;
}
interface TestRenderer {
  root: TestNode;
  update(element: ReactNode): void;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => Promise<void>): Promise<void>;
  create(element: ReactNode): TestRenderer;
}>('react-test-renderer');

describe('플랫폼 텍스트', () => {
  it('iOS·웹 내보내기는 React Native 원본이다', () => {
    expect(SystemTypography.Text).toBe(NativeText);
    expect(SystemTypography.TextInput).toBe(NativeTextInput);
    expect(SystemTypography.AnimatedText).toBe(Animated.Text);
  });

  it('로드 후 부모 굵기 상속·조건부 덮어쓰기·입력창·애니메이션을 함께 반영한다', async () => {
    let renderer!: TestRenderer;
    const render = (loaded: boolean) => (
      <AndroidFontsLoaded value={loaded}>
        <Text testID="parent" style={{ fontWeight: '600' }}>
          <Text testID="inherited">상속</Text>
          <Text testID="override" style={[{ fontWeight: '500' }, { fontWeight: '700' }]}>
            강조
          </Text>
        </Text>
        <TextInput testID="input" placeholder="검색" />
        <AnimatedText testID="animated" style={{ fontWeight: '500', opacity: 0.5 }}>
          보조
        </AnimatedText>
      </AndroidFontsLoaded>
    );
    const textStyle = (id: string) =>
      StyleSheet.flatten(
        renderer.root.findAllByType(NativeText).find((node) => node.props.testID === id)!.props
          .style,
      );
    await act(async () => {
      renderer = create(render(false));
    });
    expect(textStyle('parent').fontWeight).toBe('600');
    expect(textStyle('parent').fontFamily).toBeUndefined();
    await act(async () => {
      renderer.update(render(true));
    });
    expect(textStyle('parent').fontFamily).toBe('Pretendard-SemiBold');
    expect(textStyle('inherited').fontFamily).toBe('Pretendard-SemiBold');
    expect(textStyle('override').fontFamily).toBe('Pretendard-Bold');
    expect(textStyle('animated')).toMatchObject({ fontFamily: 'Pretendard-Medium', opacity: 0.5 });
    expect(
      StyleSheet.flatten(renderer.root.findByType(NativeTextInput).props.style).fontFamily,
    ).toBe('Pretendard-Regular');
    await act(async () => {
      renderer.unmount();
    });
  });
});
