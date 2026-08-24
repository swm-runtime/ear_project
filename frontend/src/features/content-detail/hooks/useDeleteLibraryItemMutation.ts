import { useMutation } from '@tanstack/react-query';

import { deleteLibraryItem } from '@/features/library';

/**
 * [삭제] — library가 소유한 계약(library-api.md 4.6)의 재사용이다(content-detail-api.md 4.2).
 * 라이브러리 목록(L5)과 달리 실행 취소 스낵바 없이 즉시 호출한다(uiux 4.3 — 확정 2026-08-23:
 * 버튼 전환만이 피드백이고, 재담기는 실행 취소가 아니라 신규 담기다).
 */
export const useDeleteLibraryItemMutation = () => useMutation({ mutationFn: deleteLibraryItem });
