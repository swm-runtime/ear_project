import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExplorePeriod } from '../explore.types';

interface PopularPeriodToggleProps {
  /** 선택 상태의 근거는 서버 응답의 period다 — 클라이언트 기본값이 없다(uiux 4.10) */
  selected: ExplorePeriod;
  onSelect: (period: ExplorePeriod) => void;
  /** 전환 중 중복 탭 차단(uiux 4.10) */
  disabled: boolean;
}

/** 라벨은 화면 문구, 값은 전송값 — 순서는 uiux 4.10의 "주간 · 월간 · 전체"다 */
const PERIODS: ExplorePeriod[] = ['week', 'month', 'all'];

/**
 * 트랙 전체 높이 = **섹션 제목 "지금 인기"의 글자 높이**(2026-09-18 지시).
 * 제목은 xl(28px)이고 실측한 글자 잉크 높이가 27px라, 토글을 28로 두면 제목과 나란히 선 한 줄로 읽힌다.
 * 종전 34는 글자보다 6~7px 커서 토글이 제목을 누르는 것처럼 보였다.
 */
const TRACK_HEIGHT = theme.font.size.xl;
/** 트랙 테두리 — 흰 트랙의 윤곽을 준다(아래 container 주석) */
const TRACK_BORDER = 1;
/**
 * 트랙 안쪽 여백 — 선택 알약 둘레로 여백이 **눈에 띄게** 남아야 "트랙 안에 떠 있는 알약"으로 읽힌다.
 * 2였을 때는 알약이 트랙 가장자리에 붙어 끼인 것처럼 보였다.
 */
const TRACK_INSET = 3;
/** 보이는 알약 높이 — 트랙 높이에서 테두리·여백을 뺀 나머지(28 − (3 + 1) × 2 = 20) */
const SEGMENT_HEIGHT = TRACK_HEIGHT - (TRACK_INSET + TRACK_BORDER) * 2;
/**
 * 알약 폭 — 세 구간을 **같은 폭**으로 둔다. 라벨이 모두 두 글자라 폭이 같아야 선택 알약이
 * 옮겨갈 때 크기가 변하지 않는다. 폭을 내용에 맡기면 글자마다 폭이 조금씩 달라 알약이 옮겨갈 때
 * 늘었다 줄며 흔들린다.
 */
const SEGMENT_WIDTH = 48;

/**
 * 보이는 높이를 줄이는 대신 위아래로 넓힌 터치 영역. 명세 7장의 44×44pt는
 * **눌리는 영역** 기준이므로 hitSlop으로 채운다 — 알약을 44pt로 그리면
 * 제목 줄이 토글 높이에 끌려가 "인기 콘텐츠" 제목보다 커진다.
 */
const SEGMENT_HIT_SLOP = {
  top: (theme.touchTarget.minHeight - SEGMENT_HEIGHT) / 2,
  bottom: (theme.touchTarget.minHeight - SEGMENT_HEIGHT) / 2,
};

/**
 * E13 인기 구간 토글 — 인기 섹션 제목 줄에만 붙는 3택 1 세그먼트 컨트롤.
 * 확정 구간이 없어도 세 구간 모두 항상 고를 수 있다 — 탭을 숨기거나 비활성화하지 않는다
 * (explore.md 4.1-1 · uiux 8장). 선택 상태는 색만이 아니라 **떠 있는 알약(면·그림자)** 형태로도
 * 드러낸다(uiux 7장 — 색만으로 구분하지 않는다). 굵기는 셋이 같다 — 아래 label 주석.
 */
export default function PopularPeriodToggle({
  selected,
  onSelect,
  disabled,
}: PopularPeriodToggleProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel={EXPLORE_COPY.popular.toggleA11y}
    >
      {PERIODS.map((period) => {
        const isSelected = period === selected;
        return (
          <Pressable
            key={period}
            style={[styles.segment, isSelected && styles.segmentSelected]}
            onPress={() => onSelect(period)}
            hitSlop={SEGMENT_HIT_SLOP}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={EXPLORE_COPY.popular.periodLabels[period]}
            accessibilityState={{ checked: isSelected, disabled }}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {EXPLORE_COPY.popular.periodLabels[period]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * 트랙 — 흰 바탕에 연한 테두리(2026-09-18 지시, 레퍼런스 "일·주·월" 토글).
   * 회색으로 채운 트랙 위에 흰 알약을 얹으면 두 면의 명도 차가 거의 없어 알약이 번져 보였다.
   * 트랙을 비우고 테두리로만 둘러야 그림자 진 알약이 "떠 있는" 것으로 읽힌다.
   */
  container: {
    flexDirection: 'row',
    backgroundColor: theme.color.background,
    borderWidth: TRACK_BORDER,
    borderColor: theme.color.border,
    // 바깥 트랙도 알약으로 둔다 — 안쪽만 둥글면 모서리에 각진 여백이 남는다
    borderRadius: theme.radius.full,
    padding: TRACK_INSET,
  },
  segment: {
    // 보이는 높이는 제목에 맞추고, 44pt는 위 SEGMENT_HIT_SLOP이 채운다(uiux 7).
    // 폭은 48로 고정 — 터치 최소폭 44를 넘고, 세 구간이 같은 폭이 된다(위 SEGMENT_WIDTH)
    height: SEGMENT_HEIGHT,
    width: SEGMENT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
  },
  /**
   * 선택 알약 — 흰 면을 **부드러운 그림자로 띄운다**(레퍼런스 토글과 같은 결). 이 코드베이스에서
   * 그림자를 쓰는 첫 자리다. `shadow*` 속성 대신 `boxShadow`를 쓴다 — RN 0.86(새 아키텍처)과
   * react-native-web이 같은 문자열을 그대로 그려, 플랫폼마다 값을 따로 맞출 필요가 없다.
   */
  segmentSelected: {
    backgroundColor: theme.color.background,
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.14)',
  },
  /**
   * 라벨 굵기는 선택과 **무관하게 같다** — 선택은 색(회색 → 검정)과 알약으로만 가른다.
   * 선택만 굵히면 라벨 폭이 변해 시선이 튄다(TopicChip과 같은 이유). 레퍼런스도 셋 다 굵다.
   */
  label: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  labelSelected: {
    color: theme.color.textPrimary,
  },
});
