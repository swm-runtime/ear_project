/**
 * 사용자 노출 문구(convention.md 3.5). 네 진입점의 [공유]가 같은 문자열을 쓴다 —
 * 진입점마다 규칙·문구를 다시 정하지 않는다(share.md 2, share-uiux.md 4.1~4.2).
 */
import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

const ko = {
  /** 확정(2026-09-04, changes/pending/share-p1-copy-decisions.md) — 아이콘 낭독 라벨도 이 값이다 */
  action: '공유',
} as const;

const en: LocalizedCopy<typeof ko> = {
  action: 'Share',
};

export const SHARE_COPY = localized({ ko, en });
