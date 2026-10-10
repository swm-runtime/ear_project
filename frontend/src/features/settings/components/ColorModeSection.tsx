import { Platform } from 'react-native';

import {
  setColorModePreference,
  theme,
  useColorModePreference,
  type ColorModePreference,
} from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';

import { SETTINGS_COPY } from '../settings.copy';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

const MARK_SIZE = 20;
const OPTIONS: ColorModePreference[] = ['system', 'light', 'dark'];

/**
 * 화면 모드 — iOS 설정의 체크 목록(음질 섹션과 같은 모양, PM 2026-10-10 "시스템 / 라이트 / 다크 선택까지 둬라").
 * 고른 줄 끝에 체크. 값은 기기에 저장하고 서버로 보내지 않는다(기기 표시 설정). 적용은 shared/theme 가 한다 —
 * iOS 는 즉시 다시 칠하고, Android 는 칠할 모드가 바뀌면 앱을 다시 불러 칠한다(섹션 아래 설명)
 */
export default function ColorModeSection() {
  const selected = useColorModePreference();
  const copy = SETTINGS_COPY.colorMode;
  return (
    <SettingsSection
      title={SETTINGS_COPY.sections.colorMode}
      footer={Platform.OS === 'android' ? copy.footerAndroid : copy.footer}
      bodyRole="radiogroup"
    >
      {OPTIONS.map((option) => {
        const isSelected = option === selected;
        return (
          <SettingsRow
            key={option}
            label={copy.label[option]}
            onPress={() => setColorModePreference(option)}
            role="radio"
            isChecked={isSelected}
            a11yLabel={copy.label[option]}
            rightSlot={
              isSelected ? <CheckIcon size={MARK_SIZE} color={theme.color.primary} /> : null
            }
          />
        );
      })}
    </SettingsSection>
  );
}
