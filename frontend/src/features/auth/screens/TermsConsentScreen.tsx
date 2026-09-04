import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import ChevronIcon from '@/shared/ui/ChevronIcon';

import { AUTH_COPY } from '../auth.copy';
import type { AuthStackParamList } from '../auth.types';
import ConsentItem from '../components/ConsentItem';
import { useTermsConsentScreen } from '../hooks/useTermsConsentScreen';

type TermsConsentScreenProps = NativeStackScreenProps<AuthStackParamList, 'TermsConsent'>;

/**
 * A4 약관 동의 — 신규 가입 시 별도 화면. [동의하고 시작하기]를 누른 시점에 계정이 생성된다.
 * 모든 체크박스는 기본값 해제(auth-uiux.md 4.3). 이탈 시 계정이 만들어지지 않는다.
 * 시각 개편(2026-09-04, changes/pending/auth-consent-visual-refresh.md): 브랜드 로고 +
 * 환영 인사가 주인공이고 동의 리스트는 하부에 조용히 두는 구성(스타벅스 결).
 * 체크리스트 구조·필수/선택 구분·[보기]·비활성 규칙은 그대로다.
 */
export default function TermsConsentScreen({ route, navigation }: TermsConsentScreenProps) {
  const {
    items,
    isAllChecked,
    canSubmit,
    isSubmitting,
    toggleConsent,
    toggleAll,
    handleViewPress,
    handleSubmit,
  } = useTermsConsentScreen(route.params);

  return (
    <SafeAreaView style={styles.container}>
      {/* 뒤로가기 — 계정은 아직 없으니 로그인 선택으로 돌아간다 */}
      <Pressable
        style={styles.back}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="뒤로가기"
      >
        <ChevronIcon direction="left" size={24} color={theme.color.textPrimary} />
      </Pressable>

      <View style={styles.body}>
        {/* 브랜드 로고 + 환영 인사 — 이 화면의 주인공. 동의는 그 아래 조연이다 */}
        <Image
          source={require('../../../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="이어"
        />
        <Text style={styles.greeting}>{AUTH_COPY.consent.greeting}</Text>
        <Text style={styles.title}>{AUTH_COPY.consent.title}</Text>

        <View style={styles.list}>
          <Pressable
            style={styles.agreeAll}
            onPress={toggleAll}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isAllChecked }}
            accessibilityLabel={AUTH_COPY.consent.agreeAll}
          >
            <View style={[styles.circle, isAllChecked && styles.circleChecked]}>
              {isAllChecked ? <CheckIcon size={15} color={theme.color.onPrimary} /> : null}
            </View>
            <Text style={styles.agreeAllLabel}>{AUTH_COPY.consent.agreeAll}</Text>
          </Pressable>

          <View style={styles.divider} />

          {items.map((item) => (
            <ConsentItem
              key={item.consentType}
              label={item.label}
              isRequired={item.isRequired}
              isChecked={item.isChecked}
              description={item.description}
              onToggle={() => toggleConsent(item.consentType)}
              // 마케팅은 열람 문서 없이 한 줄 고지로 충분하다 — [보기] 셰브론 생략
              onViewPress={
                item.consentType === 'marketing'
                  ? undefined
                  : () => handleViewPress(item.consentType)
              }
            />
          ))}
        </View>
      </View>

      <Pressable
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        disabled={!canSubmit || isSubmitting}
        onPress={handleSubmit}
        accessibilityRole="button"
        accessibilityLabel={AUTH_COPY.consent.submit}
        accessibilityState={{ disabled: !canSubmit || isSubmitting }}
      >
        {isSubmitting ? (
          <ActivityIndicator color={theme.color.onPrimary} />
        ) : (
          <Text style={styles.submitLabel}>{AUTH_COPY.consent.submit}</Text>
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
  body: {
    flex: 1,
    // 로고·인사를 한 뼘 아래로 — 상단 여백이 숨을 만든다
    paddingTop: theme.spacing.xl + theme.spacing.md,
  },
  logo: {
    width: 176,
    height: 144,
    marginBottom: theme.spacing.lg,
  },
  /** 환영 인사 — 이 화면의 헤드라인(검정, 크게) */
  greeting: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl * 1.3,
    marginBottom: theme.spacing.sm,
  },
  /** 동의 필요 안내 — 확정 카피 유지, 보조 톤으로 강등 */
  title: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.5,
  },
  /** 리스트는 화면 하부에 조용히 — 인사와 동의 사이 큰 여백이 위계를 만든다 */
  list: {
    marginTop: 'auto',
    paddingTop: theme.spacing.xl,
    // 마지막 항목(마케팅)과 하단 버튼 사이 숨 — 고지 문구가 버튼에 붙지 않게
    paddingBottom: theme.spacing.lg,
  },
  agreeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
  },
  /** 빈 원형 체크(스타벅스 결) — 체크 시 primary 채움 */
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm + theme.spacing.xs,
  },
  circleChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  agreeAllLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
    marginVertical: theme.spacing.sm,
  },
  /** 온보딩 진행 버튼과 같은 알약 — 라벨은 법적 명시라 아이콘화하지 않는다 */
  submit: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  submitDisabled: {
    backgroundColor: theme.color.border,
  },
  submitLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
