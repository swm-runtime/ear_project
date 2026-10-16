import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { AUTH_COPY } from '../auth.copy';
import type { AuthStackParamList } from '../auth.types';
import LanguageOptionCard from '../components/LanguageOptionCard';
import { CONTENT_LANGUAGES, useContentLanguageScreen } from '../hooks/useContentLanguageScreen';

type ContentLanguageScreenProps = NativeStackScreenProps<AuthStackParamList, 'ContentLanguage'>;

const COPY = AUTH_COPY.contentLanguage;

/**
 * A21 콘텐츠 언어 선택 — **신규 가입자만** 거친다(A1 → A21 → A4, PM 2026-10-15). 고른 언어가 시장을 정하고
 * 가입 뒤에는 바꿀 수 없으므로(global-api.md 2.1) 무엇이 달라지는지·해외 거주자 안내·변경 불가를 한 화면에 둔다.
 * 계정은 아직 없다 — 뒤로 가면 시작 화면이다. 머리(뒤로가기)·하단 알약 버튼은 A4와 같은 결이다.
 * [다음]은 고른 언어로 동의 목록을 다시 받는 동안 진행 중(스피너·비활성)이다(PM 2026-10-16).
 */
export default function ContentLanguageScreen({ route }: ContentLanguageScreenProps) {
  const { selected, select, handleNext, isLoading, goBack } = useContentLanguageScreen(
    route.params,
  );

  return (
    <SafeAreaView style={styles.container}>
      <Pressable
        style={styles.back}
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={COPY.backA11y}
      >
        <ChevronIcon direction="left" size={24} color={theme.color.textPrimary} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole="header">
          {COPY.title}
        </Text>
        <Text style={styles.description}>{COPY.description}</Text>

        <View style={styles.options} accessibilityRole="radiogroup">
          {CONTENT_LANGUAGES.map((language) => (
            <LanguageOptionCard
              key={language}
              label={COPY.option[language]}
              description={COPY.optionDescription[language]}
              isSelected={selected === language}
              onPress={() => select(language)}
            />
          ))}
        </View>

        <Text style={styles.recommend}>{COPY.recommendOverseas}</Text>
      </ScrollView>

      <Text style={styles.notice}>{COPY.notChangeable}</Text>
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
        accessibilityLabel={COPY.next}
        accessibilityState={{ disabled: isLoading, busy: isLoading }}
      >
        {isLoading ? (
          <ActivityIndicator color={theme.color.onPrimary} />
        ) : (
          <Text style={pillButton.primaryLabel}>{COPY.next}</Text>
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
