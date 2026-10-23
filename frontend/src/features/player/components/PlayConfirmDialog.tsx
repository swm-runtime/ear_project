import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';
import { Text } from '@/shared/ui/Typography';

import { PLAYER_COPY } from '../player.copy';

interface PlayConfirmDialogProps {
  visible: boolean;
  /** 팝업에 적는 남은 횟수 — 서버가 내려준 값으로 화면이 계산한 힌트다 */
  remaining: number;
  onConfirm: () => void;
  onCancel: () => void;
  /** [오늘은 보지 않기]를 체크하고 [재생하기] — 팝업을 닫고 그대로 재생한다. 차감은 그대로(library.md 4.3) */
  onSuppressToday: () => void;
}

/** 체크 칸 지름 — iOS 체크 원(checkmark.circle)과 같은 결 */
const CHECK_SIZE = 22;

/**
 * L3 재생 확인 팝업 — 알리는 것은 남은 횟수와 1회 차감뿐. 업그레이드 유도를 얹지 않는다.
 *
 * 공용 확인 팝업(ConfirmDialog)에 얹는다 — iOS 26 은 리퀴드 글라스 면, 그 밑은 흰 면(PM 2026-10-23 "리퀴드글라스 팝업으로").
 * [오늘은 보지 않기]는 버튼이 아니라 **체크 칸**이다(같은 날 PM "체크표시로") — 체크하고 [재생하기]를 눌러야 억제가 걸린다.
 * 종전 제목 줄 오른쪽 위 글자 버튼은 누르는 즉시 재생해 "닫기"로 읽혔다(library-uiux.md 9장 V8). [취소]는 체크와 무관하게 억제하지 않는다
 */
export default function PlayConfirmDialog({
  visible,
  remaining,
  onConfirm,
  onCancel,
  onSuppressToday,
}: PlayConfirmDialogProps) {
  const [suppress, setSuppress] = useState(false);
  // 다음에 뜰 때는 늘 빈 칸에서 시작한다 — 닫는 세 길(취소·재생·뒤로가기) 모두에서 되돌린다
  const close = (next: () => void) => {
    setSuppress(false);
    next();
  };

  return (
    <ConfirmDialog
      isVisible={visible}
      title={PLAYER_COPY.playConfirm.title(remaining)}
      body={PLAYER_COPY.playConfirm.body}
      // 시스템 알림처럼 바깥 탭으로 닫히지 않는다(종전 팝업과 같다). 뒤로가기는 취소
      dismissOnBackdrop={false}
      secondaryAction={{ label: PLAYER_COPY.playConfirm.cancel, onPress: () => close(onCancel) }}
      primaryAction={{
        label: PLAYER_COPY.playConfirm.play,
        onPress: () => close(suppress ? onSuppressToday : onConfirm),
      }}
      onCloseRequest={() => close(onCancel)}
    >
      <Pressable
        style={styles.checkRow}
        onPress={() => setSuppress((value) => !value)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: suppress }}
        accessibilityLabel={PLAYER_COPY.playConfirm.suppressToday}
      >
        <View style={[styles.checkBox, suppress && styles.checkBoxOn]}>
          {suppress ? <CheckIcon size={14} color={theme.color.onPrimary} strokeWidth={3} /> : null}
        </View>
        <Text style={styles.checkLabel}>{PLAYER_COPY.playConfirm.suppressToday}</Text>
      </Pressable>
    </ConfirmDialog>
  );
}

const styles = StyleSheet.create({
  // 본문 아래 한 줄 — 줄 전체가 히트 영역(44pt)
  checkRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
  },
  checkBox: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 1.5,
    borderColor: theme.color.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 체크 — 주 동작과 같은 색 채움(검정, 다크 모드는 흰색) + 반전 체크
  checkBoxOn: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.primary,
  },
  checkLabel: {
    fontSize: 15,
    color: theme.color.textSecondary,
  },
});
