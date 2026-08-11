import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { PlaybackRate } from '@/features/settings';

import { PLAYER_COPY } from '../player.copy';

/** 허용값 5개뿐이다 — 슬라이더·커스텀 입력을 두지 않는다(player-uiux.md 4.5) */
const RATE_OPTIONS: PlaybackRate[] = [0.8, 1.0, 1.2, 1.5, 2.0];

interface PlayerRateSheetProps {
  isVisible: boolean;
  currentRate: PlaybackRate;
  /** 탭 즉시 세 가지가 한 번에 — 현재 재생 적용 + 전역 저장 + 닫힘. [적용] 버튼이 없다 */
  onSelect: (rate: PlaybackRate) => void;
  onClose: () => void;
}

/** PL4 배속 선택 시트 — 설정의 기본 배속 시트와 같은 저장소(user_settings)를 쓴다 */
export default function PlayerRateSheet({
  isVisible,
  currentRate,
  onSelect,
  onClose,
}: PlayerRateSheetProps) {
  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      {/* 딤 탭·뒤로가기로 닫으면 아무것도 바뀌지 않는다(player-uiux.md 4.5) */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.sheet} accessible={false}>
          <View style={styles.handle} />
          <View accessibilityViewIsModal accessibilityRole="radiogroup">
            <Text style={styles.title} accessibilityRole="header">
              {PLAYER_COPY.rateSheet.title}
            </Text>
            {RATE_OPTIONS.map((rate) => {
              const isSelected = rate === currentRate;
              return (
                <Pressable
                  key={rate}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  onPress={() => onSelect(rate)}
                  accessibilityRole="radio"
                  accessibilityLabel={PLAYER_COPY.rateSheet.optionA11y(rate)}
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {PLAYER_COPY.rateSheet.optionLabel(rate)}
                  </Text>
                  {isSelected ? (
                    <Text
                      style={styles.check}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    >
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
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
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.border,
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    paddingVertical: theme.spacing.sm,
  },
  option: {
    minHeight: theme.touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
  },
  optionPressed: {
    backgroundColor: theme.color.surface,
  },
  optionLabel: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  optionLabelSelected: {
    fontWeight: '700',
    color: theme.color.primary,
  },
  check: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.primary,
  },
});
