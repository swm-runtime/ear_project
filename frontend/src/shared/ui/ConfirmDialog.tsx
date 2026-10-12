import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import GlassSurface, { HAS_LIQUID_GLASS } from '@/shared/ui/GlassSurface';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

export interface DialogAction {
  label: string;
  onPress: () => void;
  /** 처리 중 중복 탭 차단 — 낭독기에도 비활성으로 읽힌다 */
  disabled?: boolean;
  /** 처리 중 — 라벨 대신 스피너(알림 사전 안내의 OS 권한 요청·기기 동기화). 탭도 막는다 */
  isBusy?: boolean;
  /**
   * 파괴적 확인(로그아웃 등) — **주 액션 자리에서만** 쓴다. 채운 빨강 + 흰 글자(iOS 의 확인 시트 [삭제],
   * SwiftUI `.borderedProminent` + red tint). 보조 자리의 파괴적 동작은 연한 면(`dangerSurface`)이다 —
   * 채운 빨강을 보조에 쓰면 검정 주 동작보다 더 튀어 둘이 뒤바뀐다(design.md §1·§5).
   *
   * **저장 전 로컬 편집만 버리는 [나가기] 에는 쓰지 않는다** — 커리어·관심사 이탈 확인은 서버 상태가 그대로라
   * 파괴적으로 그리면 나가기를 겁내게 된다(interest-management-uiux.md 4.6 금지 항목)
   */
  isDestructive?: boolean;
}

export interface ConfirmDialogProps {
  isVisible: boolean;
  /** 제목. 관심사 해제 확인(IM4)처럼 본문 한 줄로 끝나는 팝업은 생략한다 */
  title?: string;
  /** 제목만으로 부족할 때의 보조 문장. 없으면 제목 하나로 끝낸다 */
  body?: string;
  /** 문자열로 못 적는 본문(선택 가능한 연락처 등) — `body` 아래에 그린다 */
  children?: ReactNode;
  /** 제목 위 아이콘(알림 사전 안내의 종). 있으면 제목·본문을 가운데 정렬한다 — 아이콘이 가운데인데 글이 왼쪽이면 어긋난다 */
  icon?: ReactNode;
  /**
   * 딤 영역 탭으로 닫히는가(기본 true). 커리어 이탈 확인(CR5)처럼 **파괴적 결과가 걸린 팝업은 false** —
   * 의도 없는 탭으로 닫히면 어느 쪽을 고른 것인지 알 수 없다(career-uiux.md 4.6). 뒤로가기는 언제나 `onCloseRequest`
   */
  dismissOnBackdrop?: boolean;
  /**
   * 왼쪽 보조 액션([닫기]·[취소]). **알리기만 하는 팝업은 생략한다** — 그때는 주 액션 하나가 버튼 줄을 채운다
   * (HIG Alerts: 정보 전달 알림은 버튼 하나. 가입 체험 안내 P11 — profile-uiux.md 4.11). 고를 것이 없는데 [취소]를
   * 세우면 "무엇을 취소하나"로 읽힌다
   */
  secondaryAction?: DialogAction;
  /** 오른쪽 주 액션 — 주 액션은 오른쪽에 둔다(settings-uiux.md 5장 규칙과 같다) */
  primaryAction: DialogAction;
  /** 딤 탭·뒤로가기는 보조 액션과 같게 취급한다(보조 액션이 없으면 주 액션과 같게) */
  onCloseRequest: () => void;
}

/**
 * 앱의 **유일한 확인 다이얼로그 구현**(design.md §5 시트·다이얼로그) — 도메인 지식이 없어 shared에 둔다(architecture.md 4.3).
 *
 * 2026-09-27 까지 career·interest·settings 가 각자 다이얼로그를 갖고 있어 공용 규칙(보조 버튼 surface 채움, 09-26)이
 * 그쪽엔 닿지 않았다(PM 09-27 03:02 "4,5,6 디자인을 1,2,3 에 맞춰"). 셋은 이제 이 컴포넌트의 얇은 껍데기다 —
 * 제목 생략·본문 슬롯·딤 탭 차단·버튼 비활성 등 각자 갖고 있던 차이는 prop 으로 흡수했다.
 *
 * 모양 — **iOS 26 시스템 알림과 같은 문법**(PM 2026-10-09, 알림 권한 팝업을 보고 "우리도 이렇게"): iOS 26 은 리퀴드
 * 글라스 면(GlassView), 큰 연속 곡률(32), 왼쪽 정렬 제목 17 굵게 · 본문 15, 높이 48 캡슐 버튼 둘을 나란히. 보조 동작은
 * 반투명 회색 캡슐(시스템 알림 버튼과 같은 결), 주 동작은 우리 앱 주 동작 그대로 검정 채움, 주 액션은 오른쪽.
 * 그 밑 iOS · Android 는 같은 모양에 흰 면(글라스 없음).
 */
export default function ConfirmDialog({
  isVisible,
  title,
  body,
  children,
  icon,
  dismissOnBackdrop = true,
  secondaryAction,
  primaryAction,
  onCloseRequest,
}: ConfirmDialogProps) {
  const isDestructive = primaryAction.isDestructive ?? false;
  const secondaryDisabled =
    (secondaryAction?.disabled ?? false) || (secondaryAction?.isBusy ?? false);
  const primaryDisabled = (primaryAction.disabled ?? false) || (primaryAction.isBusy ?? false);
  const centered = icon !== undefined;
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCloseRequest}>
      <Pressable
        style={styles.backdrop}
        onPress={dismissOnBackdrop ? onCloseRequest : undefined}
        accessible={false}
      >
        <Pressable accessible={false} style={styles.dialogWrap}>
          <View style={styles.dialogFrame} accessibilityViewIsModal>
            {HAS_LIQUID_GLASS ? <GlassSurface style={StyleSheet.absoluteFill} /> : null}
            <View style={[styles.dialog, centered && styles.dialogCentered]}>
              {icon !== undefined ? (
                <View accessibilityElementsHidden importantForAccessibility="no">
                  {icon}
                </View>
              ) : null}
              {title !== undefined ? (
                <Text style={[styles.title, centered && styles.textCentered]}>{title}</Text>
              ) : null}
              {body !== undefined ? (
                <Text style={[styles.body, centered && styles.textCentered]}>{body}</Text>
              ) : null}
              {children}
              <View style={styles.actions}>
                {secondaryAction === undefined ? null : (
                  <Pressable
                    style={[
                      pillButton.base,
                      pillButton.secondary,
                      styles.button,
                      HAS_LIQUID_GLASS && styles.buttonOnGlass,
                      secondaryDisabled && styles.buttonDisabled,
                    ]}
                    onPress={secondaryAction.onPress}
                    disabled={secondaryDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={secondaryAction.label}
                    accessibilityState={{ disabled: secondaryDisabled }}
                  >
                    {secondaryAction.isBusy ? (
                      <ActivityIndicator color={theme.color.textPrimary} />
                    ) : (
                      <Text style={pillButton.secondaryLabel}>{secondaryAction.label}</Text>
                    )}
                  </Pressable>
                )}
                <Pressable
                  style={[
                    pillButton.base,
                    isDestructive ? pillButton.destructive : pillButton.primary,
                    styles.button,
                    primaryDisabled && styles.buttonDisabled,
                  ]}
                  onPress={primaryAction.onPress}
                  disabled={primaryDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={primaryAction.label}
                  accessibilityState={{ disabled: primaryDisabled }}
                >
                  {primaryAction.isBusy ? (
                    <ActivityIndicator color={theme.color.onPrimary} />
                  ) : (
                    <Text
                      style={isDestructive ? pillButton.destructiveLabel : pillButton.primaryLabel}
                    >
                      {primaryAction.label}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 다이얼로그 면 곡률 — iOS 26 시스템 알림처럼 크게 */
const DIALOG_RADIUS = 32;
/** 버튼 높이 — 시스템 알림 캡슐 버튼과 같은 48 */
const BUTTON_HEIGHT = 48;

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
  // 면 — iOS 26 은 글라스가 깔리고(투명 바탕), 그 밑은 흰 면. 곡률은 시스템 알림처럼 크게(32)
  dialogFrame: {
    borderRadius: DIALOG_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: HAS_LIQUID_GLASS ? 'transparent' : theme.color.background,
  },
  dialog: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md + theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  dialogCentered: {
    alignItems: 'center',
  },
  textCentered: {
    textAlign: 'center',
  },
  // 시스템 알림의 글자 — 제목 17 굵게, 본문 15
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: 17 * 1.35,
  },
  body: {
    fontSize: 15,
    color: theme.color.textSecondary,
    lineHeight: 15 * 1.45,
  },
  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  // 크기만 — 모양·역할 색은 공용 알약(pillButton). 보조 동작은 테두리 없는 연한 면(design.md §5, 2026-09-22 PM
  // "검정 버튼 옆에서 선으로 그린 상자는 낡아 보인다"), 파괴적 확인은 채운 빨강(위 isDestructive 주석)
  button: {
    flex: 1,
    minHeight: BUTTON_HEIGHT,
  },
  // 글라스 위 보조 동작 — 시스템 알림 버튼처럼 반투명 회색(흰 surface 면은 유리 위에서 뜬다)
  buttonOnGlass: {
    backgroundColor: theme.color.fillSecondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
