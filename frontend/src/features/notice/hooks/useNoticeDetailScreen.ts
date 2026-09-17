import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useRef } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useToastStore } from '@/shared/ui/toast.store';

import { NOTICE_COPY } from '../notice.copy';
import type { NoticeSummary } from '../notice.types';
import { useNoticeQuery } from './useNoticeQuery';

/** NoticeDetail 라우트 파라미터 — app 내비게이션 타입(MainStackParamList)과 모양을 맞춘다 */
type NoticeDetailRouteParams = {
  NoticeDetail: { noticeId: string };
};

/**
 * 공지 상세 화면(S9·S11)의 로직 소유자 — 화면은 뷰만 담당한다.
 * 제목·날짜는 목록 캐시 값으로 즉시 그리고 본문만 기다린다(settings.md 4.7 규칙 4).
 */
export const useNoticeDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<NoticeDetailRouteParams, 'NoticeDetail'>>();
  const { noticeId } = route.params;
  const showToast = useToastStore((s) => s.show);

  const { query, cachedSummary } = useNoticeQuery(noticeId);

  /** 헤더(배지·제목·날짜) — 응답이 오면 응답이, 그 전엔 목록 요약이 채운다. 둘 다 없으면 스켈레톤 */
  const header: NoticeSummary | null = query.data ?? cachedSummary;

  /* ── 404(삭제·미발행) — 상세를 그리지 않고 안내 후 뒤로(settings.md 4.7 규칙 6) ── */
  const isNotFound =
    isApiError(query.error) && query.error.errorCode === ERROR_CODES.NOTICE_NOT_FOUND;

  const hasRedirectedRef = useRef(false);
  // 복귀 내비게이션과 동기화한다 — 같은 에러에 두 번 뒤로 가지 않도록 1회만 반응한다
  useEffect(() => {
    if (!isNotFound || hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    showToast(NOTICE_COPY.deleted);
    navigation.goBack();
  }, [isNotFound, navigation, showToast]);

  /** 그 밖의 실패는 전면 오류 + [다시 시도](S11). 404는 복귀 중이라 오류 화면을 그리지 않는다 */
  const isFullError = query.isError && !isNotFound;

  const retry = (): void => {
    if (query.isFetching) return;
    void query.refetch();
  };

  return {
    header,
    body: query.data?.body ?? null,
    /** 본문 스켈레톤 — 0.3초 미만이면 표시하지 않는다(settings-uiux.md 4.7 S9) */
    showBodySkeleton: useDelayedVisible(query.isPending),
    isBodyLoading: query.isPending,
    isFullError,
    isRetrying: query.isFetching,
    retry,
    goBack: () => navigation.goBack(),
  };
};
