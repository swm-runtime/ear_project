import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { SETTINGS_COPY } from '../settings.copy';
import type { PlaybackRate } from '../settings.types';

/** 서버 허용값과 동일한 선택지(settings-api.md 4.2) */
const RATE_OPTIONS: PlaybackRate[] = [0.8, 1.0, 1.2, 1.5, 2.0];

interface PlaybackRateSheetProps {
  isVisible: boolean;
  currentRate: PlaybackRate;
  /** 선택 즉시 저장 + 닫힘 — [저장] 버튼을 두지 않는다(settings.md 4.2) */
  onSelect: (rate: PlaybackRate) => void;
  onClose: () => void;
}

/** 기본 배속 선택 시트 — 현재 값 강조, radiogroup(settings-uiux.md 5장·7장) */
export default function PlaybackRateSheet({
  isVisible,
  currentRate,
  onSelect,
  onClose,
}: PlaybackRateSheetProps) {
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      {/* 딤 탭은 취소다(settings-uiux.md 5장) */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.sheet} accessible={false}>
          <View accessibilityViewIsModal accessibilityRole="radiogroup">
            <Text style={styles.title} accessibilityRole="header">
              {SETTINGS_COPY.playback.sheetTitle}
            </Text>
            {RATE_OPTIONS.map((rate) => {
              const isSelected = rate === currentRate;
              return (
                <Pressable
                  key={rate}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  onPress={() => onSelect(rate)}
                  accessibilityRole="radio"
                  accessibilityLabel={SETTINGS_COPY.playback.rateValue(rate)}
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {SETTINGS_COPY.playback.rateValue(rate)}
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
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
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
