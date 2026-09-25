import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/**
 * 상태 바 밑 **점진 블러**(애플 soft scroll edge effect, 2026-09-25 PM "애플처럼"). **항상 켜 둔다** — 흰 배경 위에선
 * 보이지 않고 콘텐츠가 밑으로 들어오면 저절로 드러난다(16:30 "그냥 상단 blur 처리하자" — 스크롤 연동 분기 폐기).
 *
 * 애플은 private `variableBlur` CAFilter(마스크 알파 → 픽셀별 블러 반경)를 쓴다. 심사 안전한 재현은 **블러 한 장을
 * 알파 그라데이션 마스크로 깎는 것**(MaskedView + LinearGradient, runtime 9) — 반경이 아니라 불투명도가 연속으로
 * 줄지만 눈에는 같은 결이다. 띠 여러 장(5·14장)은 장마다 경계가 가로줄로 남아 폐기했다(15:06·15:27 스크린샷).
 * 흰 틴트는 거의 없다 — 애플은 블러만으로 상태 바를 지키고 흰색을 깔지 않는다. 안전영역 아래로 이만큼 더 내려가며 사라진다
 */
const SCRIM_EXTEND = 8;
const SCRIM_BLUR = 40;
const SCRIM_TINT = 'rgba(255,255,255,0.18)';
/** 마스크 알파: 위 1 → 아래 0. 중간에 0.55 를 두어 위쪽이 더 오래 진하다(ease-out) */
const SCRIM_MASK_COLORS = ['rgba(0,0,0,1)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'] as const;
const SCRIM_MASK_LOCATIONS = [0, 0.45, 1] as const;

interface FloatingHeaderProps {
  children: ReactNode;
  /** 자식이 차지한 높이(안전영역 제외) — 목록이 이만큼 위를 비운다(useFloatingHeaderInset) */
  onHeightChange: (height: number) => void;
}

/**
 * 화면 위에 **떠 있는 머리 줄**(검색창·세그먼트·칩) — 배경 없이 목록 위에 절대 배치돼 콘텐츠가 그 밑으로 흐른다
 * (2026-09-24 PM "배경을 없애버리자" — iOS 26 처럼 유리 컨트롤이 콘텐츠 위에 뜬다. 탭 바와 같은 문법).
 * 안전영역(상태 바)은 여기서 채우고, 자식의 높이만 올려 목록이 `paddingTop` 으로 비운다.
 */
export default function FloatingHeader({ children, onHeightChange }: FloatingHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={[styles.header, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={[styles.scrim, { height: insets.top + SCRIM_EXTEND }]} pointerEvents="none">
            <MaskedView
              style={StyleSheet.absoluteFill}
              maskElement={
                <LinearGradient
                  style={StyleSheet.absoluteFill}
                  colors={SCRIM_MASK_COLORS}
                  locations={SCRIM_MASK_LOCATIONS}
                />
              }
            >
              {/* Android 의 실험 블러는 마스크 안에서 불안정하다 — 흰 그라데이션만 */}
              {Platform.OS === 'ios' ? (
                <BlurView style={StyleSheet.absoluteFill} tint="light" intensity={SCRIM_BLUR} />
              ) : null}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM_TINT }]} />
            </MaskedView>
        </View>
        <View onLayout={(e) => onHeightChange(e.nativeEvent.layout.height)} pointerEvents="box-none">
          {children}
        </View>
      </View>
    </>
  );
}

/**
 * 목록 `contentContainerStyle.paddingTop` — 머리 줄 높이 + 상태 바. 시스템 탭 바(iOS 26)에서는 스크롤 뷰가
 * `contentInsetAdjustmentBehavior="automatic"` 으로 상태 바를 이미 비우므로 머리 줄 높이만 더한다
 */
export const useFloatingHeaderInset = (headerHeight: number): number => {
  const insets = useSafeAreaInsets();
  return headerHeight + (HAS_NATIVE_TAB_BAR ? 0 : insets.top);
};

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  // 머리 줄 컨트롤 뒤, 화면 맨 위에 붙는다 — 상태 바 + 조금 아래
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
