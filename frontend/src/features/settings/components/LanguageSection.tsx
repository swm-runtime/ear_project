import { useLanguagePreference, type LanguagePreference } from '@/shared/i18n/locale';
import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';

import { SETTINGS_COPY } from '../settings.copy';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

const MARK_SIZE = 20;
const OPTIONS: LanguagePreference[] = ['system', 'ko', 'en'];

interface LanguageSectionProps {
  /** 가입 때 정해진 콘텐츠 언어(시장) — 섹션 아래에 "바뀌지 않는다"와 함께 알린다. 모르면 null */
  contentLanguage: string | null;
  onSelect: (next: LanguagePreference) => void;
}

/**
 * 표시 언어 — 화면 모드와 같은 iOS 체크 목록(KAN-195, global-api.md 4.3). 기기 언어 따르기 / 한국어 / English.
 * 바꾸면 서버에 알리고 기기에 저장한 뒤 앱을 다시 불러 새 언어로 그린다(shared/i18n/locale). **콘텐츠 언어(시장)는 바뀌지
 * 않는다** — 섹션 아래 설명이 말한다
 */
export default function LanguageSection({ contentLanguage, onSelect }: LanguageSectionProps) {
  const selected = useLanguagePreference();
  const copy = SETTINGS_COPY.language;
  return (
    <SettingsSection
      title={SETTINGS_COPY.sections.language}
      footer={copy.footer(contentLanguage)}
      bodyRole="radiogroup"
    >
      {OPTIONS.map((option) => {
        const isSelected = option === selected;
        return (
          <SettingsRow
            key={option}
            label={copy.label[option]}
            onPress={() => {
              if (!isSelected) onSelect(option);
            }}
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
