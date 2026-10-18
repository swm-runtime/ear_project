import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import { Text } from '@/shared/ui/Typography';

import { CONTENT_LANGUAGE_SPEECH_LOCALE } from '../auth.constants';
import type { ContentLanguage } from '../auth.types';
import LanguageSwitchText from './LanguageSwitchText';

/**
 * 카드 뒤 흐린 국기(PM 2026-10-19 — 한국어 = 태극기, English = 성조기). **미리 흐린 PNG** 다
 * (`scripts/generate-language-flags.py`): 앱에서 흐리면 Android 는 RenderScript 크래시(EAR-APP-F)라 흐림은 빌드 전에 끝낸다.
 */
const FLAG: Readonly<Record<ContentLanguage, ImageSourcePropType>> = {
  ko: require('../../../../assets/flags/flag-ko.png'),
  en: require('../../../../assets/flags/flag-en.png'),
};

interface LanguageOptionCardProps {
  /** 이 카드의 언어 — 국기·낭독 목소리를 정한다 */
  language: ContentLanguage;
  /** 선택지 이름 — 그 언어 자신의 표기("한국어" · "English") */
  label: string;
  /** 받게 되는 콘텐츠 한 줄 — 언어별 두 벌(화면이 고른 언어로 보인다) */
  descriptions: Readonly<Record<ContentLanguage, string>>;
  /** 지금 화면 문구의 언어(= 고른 선택지) */
  displayLanguage: ContentLanguage;
  isSelected: boolean;
  onPress: () => void;
}

/**
 * A21 콘텐츠 언어 선택지 한 장 — 크게 누르는 카드(면 = 둥근 사각, design.md §2).
 * 선택은 테두리 색만이 아니라 **채운 원 + 체크 도형**으로도 말한다(색만으로 상태를 구분하지 않는다 — auth-uiux.md 7).
 * 원 모양은 A4 약관 동의의 체크와 같다.
 *
 * 층(design.md §5 "장식 배경 그림"): 카드(클립, **패딩 없음**) → 국기 → `decorWash` 막 → 글자·체크(패딩은 여기) → 테두리.
 * 카드에 패딩을 주면 국기의 `100%` 가 패딩 뺀 상자로 풀려 가장자리에 바탕이 드러난다. 테두리도 카드가 아니라 맨 위
 * 겹에 그린다 — 카드 테두리는 그 두께만큼 국기를 안으로 밀어 투명 테두리 자리에 `surface` 띠가 남는다.
 */
export default function LanguageOptionCard({
  language,
  label,
  descriptions,
  displayLanguage,
  isSelected,
  onPress,
}: LanguageOptionCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={label}
      accessibilityHint={descriptions[displayLanguage]}
      // 카드 하나가 낭독 단위라 목소리는 이름(그 언어 자신의 표기)에 맞춘다 — 영어 목소리는 "한국어"를 못 읽는다
      accessibilityLanguage={CONTENT_LANGUAGE_SPEECH_LOCALE[language]}
    >
      <Image
        testID={`language-flag-${language}`}
        source={FLAG[language]}
        style={styles.flag}
        resizeMode="cover"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View
        style={[styles.fill, isSelected ? styles.washSelected : styles.wash]}
        pointerEvents="none"
      />

      <View style={styles.content}>
        <View style={styles.texts}>
          <Text style={styles.label}>{label}</Text>
          <LanguageSwitchText
            texts={descriptions}
            language={displayLanguage}
            style={styles.description}
          />
        </View>
        <View
          style={[styles.circle, isSelected && styles.circleChecked]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {isSelected ? <CheckIcon size={15} color={theme.color.onPrimary} /> : null}
        </View>
      </View>

      <View
        style={[styles.fill, styles.border, isSelected && styles.borderSelected]}
        pointerEvents="none"
      />
    </Pressable>
  );
}

const BORDER_WIDTH = 2;

const styles = StyleSheet.create({
  // 패딩 없음 — 국기가 카드 전체를 채운다(여백은 content 가 갖는다)
  card: {
    minHeight: theme.touchTarget.minHeight * 2,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: theme.color.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  // inset 과 퍼센트 크기를 함께 — 웹은 inset 만으로는 원본 크기(420×140)가 남는다(design.md §5 주제 칩 ③)
  flag: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  wash: {
    backgroundColor: theme.color.decorWash,
  },
  washSelected: {
    backgroundColor: theme.color.decorWashSelected,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight * 2,
    paddingHorizontal: theme.spacing.md + theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  // 선택 전에도 같은 두께를 잡아 둔다 — 선택될 때 글자 자리가 흔들리지 않게(테두리는 맨 위 겹이라 배치에 영향 없음)
  border: {
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    borderWidth: BORDER_WIDTH,
    borderColor: 'transparent',
  },
  borderSelected: {
    borderColor: theme.color.primary,
  },
  texts: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  // 국기 막 위라 보조색(textSecondary)은 대비가 4.5:1 아래로 떨어진다 — 위계는 색이 아니라 크기·굵기로 낸다
  description: {
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.sm * 1.4,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    // 국기 막 위에서는 border(#E3E3E8)가 묻혀 빈 원이 안 보인다 — 한 단 진한 회색(systemGray2)
    borderColor: theme.color.textMutedSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
});
