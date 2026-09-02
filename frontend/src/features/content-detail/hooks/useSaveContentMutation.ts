import { useMutation } from '@tanstack/react-query';

import { saveContent } from '@/features/explore';

/**
 * [담기]·자동 적립 — explore가 소유한 계약(explore-api.md 4.3)의 재사용이다
 * (content-detail-api.md 4.2 — 신규 계약 없음). 버튼 전환·캐시 갱신은 화면 훅이 담당한다.
 */
export const useSaveContentMutation = () => useMutation({ mutationFn: saveContent });
