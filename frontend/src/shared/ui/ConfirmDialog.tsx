import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

export interface DialogAction {
  label: string;
  onPress: () => void;
  /** 처리 중 중복 탭 차단 — 낭독기에도 비활성으로 읽힌다 */
  disabled?: boolean;
}

export interface ConfirmDialogProps {
  isVisible: boolean;
  /** 제목. 관심사 해제 확인(IM4)처럼 본문 한 줄로 끝나는 팝업은 생략한다 */
  title?: string;
  /** 제목만으로 부족할 때의 보조 문장. 없으면 제목 하나로 끝낸다 */
  body?: string;
  /** 문자열로 못 적는 본문(선택 가능한 연락처 등) — `body` 아래에 그린다 */
  children?: ReactNode;
  /**
   * 딤 영역 탭으로 닫히는가(기본 true). 커리어 이탈 확인(CR5)처럼 **파괴적 결과가 걸린 팝업은 false** —
   * 의도 없는 탭으로 닫히면 어느 쪽을 고른 것인지 알 수 없다(career-uiux.md 4.6). 뒤로가기는 언제나 `onCloseRequest`
   */
  dismissOnBackdrop?: boolean;
  /** 왼쪽 보조 액션([닫기]·[취소]) */
  secondaryAction: DialogAction;
  /** 오른쪽 주 액션 — 주 액션은 오른쪽에 둔다(settings-uiux.md 5장 규칙과 같다) */
  primaryAction: DialogAction;
  /** 딤 탭·뒤로가기는 보조 액션과 같게 취급한다 */
  onCloseRequest: () => void;
}

/**
 * 앱의 **유일한 확인 다이얼로그 구현**(design.md §5 시트·다이얼로그) — 도메인 지식이 없어 shared에 둔다(architecture.md 4.3).
 *
 * 2026-09-27 까지 career·interest·settings 가 각자 다이얼로그를 갖고 있어 공용 규칙(보조 버튼 surface 채움, 09-26)이
 * 그쪽엔 닿지 않았다(PM 09-27 03:02 "4,5,6 디자인을 1,2,3 에 맞춰"). 셋은 이제 이 컴포넌트의 얇은 껍데기다 —
 * 제목 생략·본문 슬롯·딤 탭 차단·버튼 비활성 등 각자 갖고 있던 차이는 prop 으로 흡수했다.
 *
 * 모양: xl 24 연속 곡률, 버튼 md 12 연속 곡률, 기본 동작 검정 채움 · 보조 동작 surface(테두리 없음). 주 액션은 오른쪽.
 */
export default function ConfirmDialog({
  isVisible,
  title,
  body,
  children,
  dismissOnBackdrop = true,
  secondaryAction,
  primaryAction,
  onCloseRequest,
}: ConfirmDialogProps) {
  const secondaryDisabled = secondaryAction.disabled ?? false;
  const primaryDisabled = primaryAction.disabled ?? false;
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCloseRequest}>
      <Pressable
        style={styles.backdrop}
        onPress={dismissOnBackdrop ? onCloseRequest : undefined}
        accessible={false}
      >
        <Pressable accessible={false} style={styles.dialogWrap}>
          <View style={styles.dialog} accessibilityViewIsModal>
            {title !== undefined ? <Text style={styles.title}>{title}</Text> : null}
            {body !== undefined ? <Text style={styles.body}>{body}</Text> : null}
            {children}
            <View style={styles.actions}>
              <Pressable
                style={[
                  styles.button,
                  styles.secondaryButton,
                  secondaryDisabled && styles.buttonDisabled,
                ]}
                onPress={secondaryAction.onPress}
                disabled={secondaryDisabled}
                accessibilityRole="button"
                accessibilityLabel={secondaryAction.label}
                accessibilityState={{ disabled: secondaryDisabled }}
              >
                <Text style={styles.secondaryLabel}>{secondaryAction.label}</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.primaryButton, primaryDisabled && styles.buttonDisabled]}
                onPress={primaryAction.onPress}
                disabled={primaryDisabled}
                accessibilityRole="button"
                accessibilityLabel={primaryAction.label}
                accessibilityState={{ disabled: primaryDisabled }}
              >
                <Text style={styles.primaryLabel}>{primaryAction.label}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.color.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  dialogWrap: {
    alignSelf: 'stretch',
  },
  dialog: {
    // 다이얼로그·바텀시트는 xl 이다 — 면이 큰 표면일수록 곡률을 키워야 같은 부드러움으로 읽힌다
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    backgroundColor: theme.color.background,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.md * 1.4,
  },
  body: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.5,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  button: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 보조 동작은 테두리 없이 연한 면(design.md §5 — PlayConfirmDialog 의 [취소]와 같은 규칙, 2026-09-22 PM
  // "검정 버튼 옆에서 선으로 그린 상자는 낡아 보인다"). 09-26 프로필 정비에서 맞췄다
  secondaryButton: {
    backgroundColor: theme.color.surface,
  },
  secondaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  primaryButton: {
    backgroundColor: theme.color.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
