import Svg, { Path, Rect } from 'react-native-svg';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';

import { SETTINGS_COPY } from '../settings.copy';
import type { AudioQuality, AudioQualityOption } from '../settings.types';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

const MARK_SIZE = 20;

interface AudioQualitySectionProps {
  selected: AudioQuality;
  options: AudioQualityOption[];
  onSelect: (option: AudioQualityOption) => void;
}

/**
 * 음질 — iOS 설정의 체크 목록(settings.md 4.6 · settings-uiux.md 4.1 "음질", PM 2026-10-07).
 * 고른 줄 끝에 체크, 허용되지 않은 줄은 자물쇠(누르면 요금제 관리). 섹션 아래 설명이 "다음 편부터"를 알린다
 */
export default function AudioQualitySection({
  selected,
  options,
  onSelect,
}: AudioQualitySectionProps) {
  const copy = SETTINGS_COPY.audioQuality;
  return (
    <SettingsSection
      title={SETTINGS_COPY.sections.audioQuality}
      footer={copy.footer}
      bodyRole="radiogroup"
    >
      {options.map((option) => {
        const label = copy.label[option.quality];
        const isSelected = option.allowed && option.quality === selected;
        return (
          <SettingsRow
            key={option.quality}
            label={label}
            onPress={() => onSelect(option)}
            role="radio"
            isChecked={isSelected}
            a11yLabel={option.allowed ? label : copy.lockedA11y(label)}
            rightSlot={
              !option.allowed ? (
                <LockGlyph />
              ) : isSelected ? (
                <CheckIcon size={MARK_SIZE} color={theme.color.primary} />
              ) : null
            }
          />
        );
      })}
    </SettingsSection>
  );
}

/** 자물쇠 — SF Symbols `lock.fill` 인상의 둥근 몸통 + 고리. 장식이라 낭독은 줄 라벨이 맡는다 */
function LockGlyph() {
  return (
    <Svg width={MARK_SIZE} height={MARK_SIZE} viewBox="0 0 24 24">
      <Path
        d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
        fill="none"
        stroke={theme.color.textSecondary}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Rect x={5.5} y={10} width={13} height={10} rx={2.5} fill={theme.color.textSecondary} />
    </Svg>
  );
}
