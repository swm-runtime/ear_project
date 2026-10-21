import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from '@/shared/ui/Typography';

import { CONTENT_LANGUAGE_SPEECH_LOCALE } from '../auth.constants';
import type { ContentLanguage } from '../auth.types';

interface LanguageSwitchTextProps {
  /** 언어별 문구 — 두 벌이 같으면 한 겹만 그린다 */
  texts: Readonly<Record<ContentLanguage, string>>;
  /** 지금 보일 언어(A21에서 고른 선택지) */
  language: ContentLanguage;
  style?: StyleProp<TextStyle>;
  /** 바깥 여백은 여기에 — 글자 겹에 주면 겹치기가 어긋난다 */
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityRole?: 'header';
  /**
   * 짧은 쪽 글자를 어디에 붙일지 — `bottom` 이면 남는 높이가 위로 간다. 제목처럼 아래 문단에 붙어 읽혀야 하는 글자는
   * `bottom`(제목 아래가 비면 제목과 설명이 떨어져 보인다)
   */
  align?: 'top' | 'bottom';
}

/**
 * 고른 언어로 바뀌는 글자(A21 — PM 2026-10-19). **두 언어를 같은 자리에 겹쳐 그리고 고른 쪽만 보인다** — 높이는 늘 두 벌
 * 중 큰 쪽이라, 한국어 한 줄 ↔ 영어 두 줄로 바뀌어도 아래 카드가 손가락 밑에서 움직이지 않는다.
 *
 * 겹치기: 가로 줄(row) 안에 폭 100% 글자를 나란히 두고 두 번째부터 왼쪽 여백 -100% 로 첫 자리에 겹친다(절대 배치는
 * 높이를 못 받는다). 숨은 겹은 투명 + 낭독에서 뺀다. 보이는 겹은 그 언어 목소리로 읽는다(`accessibilityLanguage`, iOS).
 */
export default function LanguageSwitchText({
  texts,
  language,
  style,
  containerStyle,
  accessibilityRole,
  align = 'top',
}: LanguageSwitchTextProps) {
  if (texts.ko === texts.en) {
    return (
      <View style={containerStyle}>
        <Text style={style} accessibilityRole={accessibilityRole}>
          {texts[language]}
        </Text>
      </View>
    );
  }

  const languages = Object.keys(texts) as ContentLanguage[];
  return (
    <View style={[styles.stack, align === 'bottom' && styles.alignBottom, containerStyle]}>
      {languages.map((layer, index) => {
        const isActive = layer === language;
        return (
          <Text
            key={layer}
            testID={`language-switch-${layer}`}
            style={[style, styles.layer, index > 0 && styles.overlap, !isActive && styles.hidden]}
            accessibilityRole={isActive ? accessibilityRole : undefined}
            accessibilityLanguage={CONTENT_LANGUAGE_SPEECH_LOCALE[layer]}
            accessibilityElementsHidden={!isActive}
            importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
            aria-hidden={!isActive}
          >
            {texts[layer]}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alignBottom: {
    alignItems: 'flex-end',
  },
  layer: {
    width: '100%',
    flexShrink: 0,
  },
  overlap: {
    marginLeft: '-100%',
  },
  hidden: {
    opacity: 0,
  },
});
