import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';

import type { ContentLanguage, Market } from '@/features/auth';

import { SETTINGS_COPY } from '../settings.copy';
import SettingsRow from './SettingsRow';
import SettingsSection from './SettingsSection';

const MARK_SIZE = 20;
const OPTIONS: readonly Market[] = ['kr', 'global'];
const LANGUAGE_OF: Readonly<Record<Market, ContentLanguage>> = { kr: 'ko', global: 'en' };

interface ContentLanguageSectionProps {
  /** 지금 시장 — 세션 값(서버 판정). 전환 직후에도 이 값이 먼저 바뀐다 */
  market: Market;
  onSelect: (language: ContentLanguage) => void;
}

/**
 * 콘텐츠 언어(시장) — 표시 언어 아래 같은 iOS 체크 목록(KAN-228 — global-api.md 4.11). 지금 언어가 체크돼 있고, 다른 언어를
 * 누르면 전환 화면으로 간다(바로 바꾸지 않는다 — 무엇이 바뀌는지와 새 언어의 동의를 그 화면이 받는다)
 */
export default function ContentLanguageSection({ market, onSelect }: ContentLanguageSectionProps) {
  const copy = SETTINGS_COPY.contentLanguageSection;
  return (
    <SettingsSection
      title={SETTINGS_COPY.sections.contentLanguage}
      footer={copy.footer}
      bodyRole="radiogroup"
    >
      {OPTIONS.map((option) => {
        const isSelected = option === market;
        return (
          <SettingsRow
            key={option}
            label={copy.label[option]}
            onPress={() => {
              if (!isSelected) onSelect(LANGUAGE_OF[option]);
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
