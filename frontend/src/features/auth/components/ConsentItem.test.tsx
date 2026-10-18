import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { AUTH_COPY } from '../auth.copy';
import ConsentItem from './ConsentItem';

interface Node {
  type: unknown;
  props: Record<string, unknown>;
  parent: Node | null;
  children: (Node | string)[];
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

/** 영어 국외 이전 동의(auth.copy.ts en) — 가장 긴 동의 문구. KAN-216 에서 iOS 큰 글자일 때 6줄째에서 잘렸다 */
const LONG_LABEL =
  'I agree that my information is transferred to and processed in the Republic of Korea, and by service providers in other countries such as the United States, as described in the Privacy Policy.';

let renderer: Renderer | null = null;
function render(label: string) {
  act(() => {
    renderer = create(
      <ConsentItem
        label={label}
        isRequired
        isChecked={false}
        description={null}
        onToggle={jest.fn()}
        onViewPress={jest.fn()}
      />,
    );
  });
  return (renderer as Renderer).root;
}
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

const host = (root: Node, testID: string) =>
  root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0];
/** 중첩 Text 까지 이어 붙인 글 — 화면에 그려지는 한 문단 */
const textContent = (node: Node): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textContent(child))).join('');
const flatText = (node: Node) => StyleSheet.flatten(node.props.style as StyleProp<TextStyle>) ?? {};

describe('ConsentItem', () => {
  it('긴 라벨은 줄 수·높이·줄 높이 제한 없이 그려져 끝의 필수 태그까지 한 문단에 남는다', () => {
    // given
    const root = render(LONG_LABEL);

    // when
    const label = host(root, 'consent-label');
    const style = flatText(label);

    // then — 고정 lineHeight 는 iOS 큰 글자에서 마지막 줄을 잘랐다(KAN-216). 높이를 묶는 값이 하나도 없어야 한다
    expect({
      numberOfLines: label.props.numberOfLines,
      adjustsFontSizeToFit: label.props.adjustsFontSizeToFit,
      lineHeight: style.lineHeight,
      height: style.height,
      maxHeight: style.maxHeight,
      text: textContent(label),
    }).toEqual({
      numberOfLines: undefined,
      adjustsFontSizeToFit: undefined,
      lineHeight: undefined,
      height: undefined,
      maxHeight: undefined,
      text: `${LONG_LABEL} ${AUTH_COPY.consent.requiredTag}`,
    });
  });

  it('원 자리의 높이는 라벨과 같은 글꼴의 투명한 한 줄이 정하고 낭독에서 빠진다', () => {
    // given
    const root = render(LONG_LABEL);

    // when
    const strut = host(root, 'consent-line-strut');
    const labelStyle = flatText(host(root, 'consent-label'));
    const strutStyle = flatText(strut);

    // then — 글자 크기 설정이 바뀌어도 원이 첫 줄 가운데에 서려면 받침 줄이 라벨과 같은 크기로 자라야 한다
    expect({
      fontSize: strutStyle.fontSize,
      lineHeight: strutStyle.lineHeight,
      opacity: strutStyle.opacity,
      hidden: [strut.props.accessible, strut.props.importantForAccessibility],
    }).toEqual({
      fontSize: labelStyle.fontSize,
      lineHeight: undefined,
      opacity: 0,
      hidden: [false, 'no-hide-descendants'],
    });
  });

  it('원은 받침 줄 위에 겹쳐 그 세로 가운데에 선다', () => {
    // given
    const root = render('Agree to Terms of Use');

    // when — 받침 줄의 형제가 원이다
    const strut = host(root, 'consent-line-strut');
    const slot = strut.parent?.parent as Node;
    const circle = (slot.children as Node[]).find((child) => child !== strut.parent) as Node;
    const circleStyle = StyleSheet.flatten(circle.props.style as StyleProp<ViewStyle>);

    // then
    expect({
      position: circleStyle.position,
      top: circleStyle.top,
      marginTop: circleStyle.marginTop,
    }).toEqual({
      position: 'absolute',
      top: '50%',
      marginTop: -Number(circleStyle.height) / 2,
    });
  });
});
