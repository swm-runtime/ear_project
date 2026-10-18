import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { CONTENT_LANGUAGE_SPEECH_LOCALE } from '../auth.constants';
import { CONTENT_LANGUAGE_COPY } from '../auth.copy';
import type { AuthStackParamList, ContentLanguage } from '../auth.types';
import LanguageOptionCard from '../components/LanguageOptionCard';
import LanguageSwitchText from '../components/LanguageSwitchText';
import { CONTENT_LANGUAGES, useContentLanguageScreen } from '../hooks/useContentLanguageScreen';

type ContentLanguageScreenProps = NativeStackScreenProps<AuthStackParamList, 'ContentLanguage'>;

type SwitchingKey = 'title' | 'description' | 'notChangeable';

/** 한 문구의 두 벌 — 고른 언어로 바뀌는 글자(LanguageSwitchText)에 넘긴다 */
const both = (key: SwitchingKey): Record<ContentLanguage, string> => ({
  ko: CONTENT_LANGUAGE_COPY.ko[key],
  en: CONTENT_LANGUAGE_COPY.en[key],
});
const optionDescriptions = (language: ContentLanguage): Record<ContentLanguage, string> => ({
  ko: CONTENT_LANGUAGE_COPY.ko.optionDescription[language],
  en: CONTENT_LANGUAGE_COPY.en.optionDescription[language],
});

/**
 * A21 콘텐츠 언어 선택 — **신규 가입자만** 거친다(A1 → A21 → A4, PM 2026-10-15). 고른 언어가 시장을 정하고
 * 가입 뒤에는 바꿀 수 없으므로(global-api.md 2.1) 무엇이 달라지는지·English 권장·변경 불가를 한 화면에 둔다.
 * 계정은 아직 없다 — 뒤로 가면 시작 화면이다. 머리(뒤로가기)·하단 알약 버튼은 A4와 같은 결이다.
 * [다음]은 고른 언어로 동의 목록을 다시 받는 동안 진행 중(스피너·비활성)이다(PM 2026-10-16).
 *
 * **화면 문구는 지금 고른 선택지의 언어를 따른다**(PM 2026-10-19) — 한국어를 고르면 한국어, English 를 고르면 영어.
 * 첫 선택이 표시 언어라 처음 그림은 표시 언어 그대로다. 앱의 표시 언어는 [다음]으로 A4에 갈 때 고른 언어로 맞춘다
 * (PM 2026-10-19 — A4부터 그 언어). 선택지 이름("한국어"·"English")과
 * 영어 사용자에게 하는 두 줄(English 설명·K-컬처 권장)은 언어와 무관하게 늘 같다.
 */
export default function ContentLanguageScreen({ route }: ContentLanguageScreenProps) {
  const { selected, select, handleNext, isLoading, goBack } = useContentLanguageScreen(
    route.params,
  );
  const copy = CONTENT_LANGUAGE_COPY[selected];

  return (
    <SafeAreaView style={styles.container}>
      <Pressable
        style={styles.back}
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={copy.backA11y}
        accessibilityLanguage={CONTENT_LANGUAGE_SPEECH_LOCALE[selected]}
      >
        <ChevronIcon direction="left" size={24} color={theme.color.textPrimary} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        // 들어가는 화면에선 iOS 고무줄 튕김을 막는다 — A4·A20 과 같다(KAN-197). 넘치면 그대로 스크롤된다
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      >
        <LanguageSwitchText
          texts={both('title')}
          language={selected}
          style={styles.title}
          containerStyle={styles.titleBlock}
          accessibilityRole="header"
          align="bottom"
        />
        <LanguageSwitchText
          texts={both('description')}
          language={selected}
          style={styles.description}
        />

        <View style={styles.options} accessibilityRole="radiogroup">
          {CONTENT_LANGUAGES.map((language) => (
            <LanguageOptionCard
              key={language}
              language={language}
              label={copy.option[language]}
              descriptions={optionDescriptions(language)}
              displayLanguage={selected}
              isSelected={selected === language}
              onPress={() => select(language)}
            />
          ))}
        </View>

        {/* 영어 사용자에게 하는 말 — 화면 언어와 무관하게 늘 영어(PM 2026-10-19) */}
        <Text style={styles.recommend} accessibilityLanguage={CONTENT_LANGUAGE_SPEECH_LOCALE.en}>
          {copy.recommendEnglish}
        </Text>
      </ScrollView>

      <LanguageSwitchText
        texts={both('notChangeable')}
        language={selected}
        style={styles.notice}
        containerStyle={styles.noticeBlock}
        align="bottom"
      />
      <Pressable
        style={({ pressed }) => [
          pillButton.base,
          pillButton.primary,
          styles.submit,
          pressed && styles.pressed,
        ]}
        disabled={isLoading}
        onPress={() => void handleNext()}
        accessibilityRole="button"
        accessibilityLabel={copy.next}
        accessibilityLanguage={CONTENT_LANGUAGE_SPEECH_LOCALE[selected]}
        accessibilityState={{ disabled: isLoading, busy: isLoading }}
      >
        {isLoading ? (
          <ActivityIndicator color={theme.color.onPrimary} />
        ) : (
          <Text style={pillButton.primaryLabel}>{copy.next}</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
  },
  back: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
  },
  /** 질문이 이 화면의 헤드라인 — A4 환영 인사와 같은 크기 */
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl * 1.3,
  },
  titleBlock: {
    marginBottom: theme.spacing.sm,
  },
  description: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.5,
  },
  options: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.sm + theme.spacing.xs,
  },
  recommend: {
    marginTop: theme.spacing.md,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.5,
  },
  /** 변경 불가 안내 — 버튼 바로 위, 누르기 전에 읽히는 자리 */
  notice: {
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
    textAlign: 'center',
  },
  noticeBlock: {
    marginBottom: theme.spacing.sm + theme.spacing.xs,
  },
  // 크기만 — 모양·색은 공용 알약(pillButton). A4 [동의하고 시작하기]와 같은 높이
  submit: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  pressed: {
    opacity: 0.8,
  },
});
