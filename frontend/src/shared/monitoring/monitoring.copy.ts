/** 사용자 노출 문구(convention.md 3.5). TODO(카피 미확정): uiux 문서에 복구 화면 카피가 없다 — 확정 시 교체 */
import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

const ko = {
  crash: {
    title: '문제가 생겨 화면을 그리지 못했어요',
    description: '다시 시도해도 계속되면 앱을 껐다 켜 주세요',
    retry: '다시 시도',
  },
} as const;

const en: LocalizedCopy<typeof ko> = {
  crash: {
    title: "Something went wrong and this screen couldn't load",
    description: 'If this keeps happening, close the app and open it again',
    retry: 'Try again',
  },
};

export const MONITORING_COPY = localized({ ko, en });
