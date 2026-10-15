import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { jobCategoryImageSource } from '../career.images';

interface JobCategoryChipsProps {
  /** 서버 목록을 받은 순서 그대로(career-api.md 4.3). 정렬하지 않는다 */
  categories: string[];
  /** 단일 선택 — 고른 칩을 다시 누르면 해제(빈 값 경로) */
  value: string | null;
  onToggle: (name: string) => void;
  disabled?: boolean;
}

/** 직군 칩 높이 — 2열 칩 폭(≈168pt)과 사진 비율 3:1 이 맞는 값 */
export const JOB_CHIP_HEIGHT = 56;

/** 칩 모서리 — 알약(full)이 아니라 둥근 상자다. 사진이 잘리는 면이 넓어야 주인공이 보인다 */
export const JOB_CHIP_RADIUS = theme.radius.lg + theme.radius.sm;

/**
 * 직군 사진 칩 — 커리어 정보(CR)와 온보딩 2/2(O4)가 같은 부품을 쓴다(PM 2026-10-11 "온보딩 2/2 는 설정의 커리어 정보에서
 * 입력하는 거 가져오자"). 테두리 없이 배경 사진, 고른 칩은 검정 막 + 흰 글자, 나머지는 흰 막 + 검정 글자(PM 2026-10-10 17:47).
 *
 * **2열 같은 크기**(PM 2026-10-10 18:09 "알약에 들어갈 때 사진이 잘린다") — 이름 길이대로 폭이 달라지면 같은 사진이 칩마다
 * 다르게 잘렸다. 줄 폭을 재서 반씩 나누고, 높이를 고정해 비율(≈3:1)을 사진(3:1로 미리 자름)과 맞춘다.
 */
export default function JobCategoryChips({
  categories,
  value,
  onToggle,
  disabled = false,
}: JobCategoryChipsProps) {
  const [rowWidth, setRowWidth] = useState(0);
  const chipWidth = rowWidth > 0 ? (rowWidth - theme.spacing.sm) / 2 : undefined;

  return (
    <View style={styles.row} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
      {categories.map((name) => {
        const isSelected = value === name;
        return (
          <Pressable
            key={name}
            style={[styles.chip, { width: chipWidth }]}
            disabled={disabled}
            onPress={() => onToggle(name)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected, disabled }}
            accessibilityLabel={name}
          >
            {/* 배경 사진 + 막 — 고른 칩은 사진이 짙게 살아나고 흰 글자, 나머지는 흰 막에 물러난다 */}
            <Image source={jobCategoryImageSource(name)} resizeMode="cover" style={styles.photo} />
            <View style={[styles.scrim, isSelected && styles.scrimSelected]} pointerEvents="none" />
            {/* 칩 높이가 고정(56)이라 긴 이름은 두 줄까지 — 세 줄째는 칩 밖으로 잘리는 대신 말줄임(KAN-197) */}
            <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={2}>
              {name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  // 사진 알약 — 테두리 없이 배경 사진(PM 2026-10-10 17:47). 사진·막 클리핑은 칩이 한 번만 한다
  chip: {
    height: JOB_CHIP_HEIGHT,
    /*
     * **칩에 패딩을 두지 않는다**(PM 2026-10-10 18:35 "사진 비율이 안 맞잖아") — 배경 사진의 width/height '100%' 가
     * 패딩을 뺀 콘텐츠 박스로 풀려 사진이 칩보다 좁게 그려졌다(TopicChip 이 iOS 에서 겪은 것과 같다). 좌우 여백은 글자가 갖는다
     */
    borderRadius: JOB_CHIP_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
  },
  /** inset 과 퍼센트 크기를 함께 준다 — 웹에서 inset 만으로는 원본 크기가 남는다(TopicChip 과 같은 규칙) */
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  // 고르지 않은 칩은 흰 막으로 물러나 글자가 검정으로 읽힌다 — 고른 칩과 밝기로 크게 갈려 색만이 아니라 대비로 구분된다
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.backgroundWash,
  },
  scrimSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  label: {
    paddingHorizontal: theme.spacing.md,
    textAlign: 'center',
    fontSize: theme.font.size.sm,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 글자 폭이 변해
    // flexWrap 줄의 뒤 칩들이 밀린다(주제 칩과 같은 규칙 — onboarding-uiux.md 7장)
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  labelSelected: {
    color: theme.color.onPhoto,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
