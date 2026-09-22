import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';
import { playerColor } from '../player.theme';
import {
  SLEEP_TIMER_MINUTES,
  isSameSleepTimerChoice,
  type SleepTimerChoice,
} from '../services/sleep-timer';

interface PlayerSleepTimerSheetProps {
  isVisible: boolean;
  /** 지금 걸려 있는 선택 — 없으면 꺼짐 */
  currentChoice: SleepTimerChoice | null;
  /** 탭 즉시 적용 + 닫힘. null = 해제. [적용] 버튼이 없다 — 배속 시트와 같은 문법(uiux 4.6) */
  onSelect: (choice: SleepTimerChoice | null) => void;
  onClose: () => void;
}

/** 행 6개: 5분 · 10분 · 15분 · 30분 · 이 에피소드 종료 시 · 해제(`player-uiux.md` 4.6 PL5) */
const OPTIONS: { key: string; choice: SleepTimerChoice | null; label: string }[] = [
  ...SLEEP_TIMER_MINUTES.map((minutes) => ({
    key: `m${minutes}`,
    choice: { kind: 'minutes', minutes } as SleepTimerChoice,
    label: PLAYER_COPY.sleepTimerSheet.minutes(minutes),
  })),
  {
    key: 'end',
    choice: { kind: 'endOfEpisode' },
    label: PLAYER_COPY.sleepTimerSheet.endOfEpisode,
  },
  { key: 'off', choice: null, label: PLAYER_COPY.sleepTimerSheet.off },
];

/** PL5 수면 타이머 시트(FR-25 P1) */
export default function PlayerSleepTimerSheet({
  isVisible,
  currentChoice,
  onSelect,
  onClose,
}: PlayerSleepTimerSheetProps) {
  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      {/* 딤 탭·뒤로가기로 닫으면 아무것도 바뀌지 않는다 */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.sheet} accessible={false}>
          <View style={styles.handle} />
          <View accessibilityViewIsModal accessibilityRole="radiogroup">
            <Text style={styles.title} accessibilityRole="header">
              {PLAYER_COPY.sleepTimerSheet.title}
            </Text>
            {OPTIONS.map((option) => {
              // "해제" 줄에는 체크를 두지 않는다 — 꺼져 있다는 것은 다른 줄에 체크가 없는 것으로 읽힌다
              const isSelected =
                option.choice !== null && isSameSleepTimerChoice(option.choice, currentChoice);
              return (
                <Pressable
                  key={option.key}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  onPress={() => onSelect(option.choice)}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {option.label}
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
    backgroundColor: playerColor.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: 'continuous',
    backgroundColor: playerColor.background,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: playerColor.border,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: playerColor.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  optionPressed: {
    backgroundColor: playerColor.surface,
  },
  optionLabel: {
    fontSize: theme.font.size.md,
    color: playerColor.textPrimary,
  },
  // 선택은 굵기 + 체크 — 색만으로 구분하지 않는다(uiux 7장)
  optionLabelSelected: {
    fontWeight: '700',
  },
  check: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: playerColor.primary,
  },
});
