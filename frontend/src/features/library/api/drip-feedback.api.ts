import { apiClient } from '@/shared/api/api-client';

import { IS_LIBRARY_API_MOCKED } from '../library.constants';
import type { DripFeedbackItem, DripFeedbackPrompt, DripFeedbackRating } from '../library.types';
import {
  mockDismissDripFeedback,
  mockFetchDripFeedbackPrompt,
  mockMuteDripFeedback,
  mockSubmitDripFeedback,
} from './drip-feedback.mock';
import type {
  DismissDripFeedbackRequestDto,
  DripFeedbackPromptItemDto,
  DripFeedbackPromptResponseDto,
  MuteDripFeedbackResponseDto,
  SubmitDripFeedbackRequestDto,
} from './library.dto';

/*
 * 추천 별점 팝업의 네 호출(drip-feedback-api.md — KAN-224). 판정은 전부 서버다 — 이 모듈은 계약을 옮길 뿐이다.
 * 멱등키는 없다(2장): 별점은 (user_id, content_id) upsert, 닫기·그만 보기는 절대값 저장이라 재전송이 같은 상태로 수렴한다.
 */

const BASE_PATH = '/users/me/drip-feedback';

/* ── 변환 — snake_case ↔ camelCase는 이 모듈 안에서만(convention.md 1.6) ── */

const toDripFeedbackItem = (dto: DripFeedbackPromptItemDto): DripFeedbackItem => ({
  contentId: dto.content_id,
  title: dto.title,
  thumbnailUrl: dto.thumbnail_url === '' ? null : dto.thumbnail_url,
  language: dto.language,
  source: dto.source,
  placedDate: dto.placed_date,
  libraryStatus: dto.library_status,
});

export const toDripFeedbackPrompt = (dto: DripFeedbackPromptResponseDto): DripFeedbackPrompt => ({
  show: dto.show,
  placedDate: dto.placed_date,
  mutedUntil: dto.muted_until,
  items: dto.items.map(toDripFeedbackItem),
});

export const toSubmitDripFeedbackRequestDto = (
  ratings: readonly DripFeedbackRating[],
): SubmitDripFeedbackRequestDto => ({
  ratings: ratings.map((rating) => ({ content_id: rating.contentId, stars: rating.stars })),
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

/** 4.1 노출 판정 — 라이브러리 진입 시. `Cache-Control: no-store`라 캐시하지 않는다 */
export const fetchDripFeedbackPrompt = async (): Promise<DripFeedbackPrompt> => {
  const data = IS_LIBRARY_API_MOCKED
    ? await mockFetchDripFeedbackPrompt()
    : (await apiClient.get<DripFeedbackPromptResponseDto>(`${BASE_PATH}/prompt`)).data;
  return toDripFeedbackPrompt(data);
};

/** 4.2 별점 저장 — 매긴 편만 보낸다. 하나라도 대상이 아니면 서버가 전부 거부한다(`DRIP_FEEDBACK_NOT_RATEABLE`) */
export const submitDripFeedback = async (input: {
  ratings: readonly DripFeedbackRating[];
}): Promise<void> => {
  const body = toSubmitDripFeedbackRequestDto(input.ratings);
  if (IS_LIBRARY_API_MOCKED) {
    await mockSubmitDripFeedback(body);
    return;
  }
  await apiClient.post(BASE_PATH, body);
};

/** 4.3 닫기 — 4.1 응답의 `placed_date`를 그대로 되돌린다 */
export const dismissDripFeedback = async (input: { placedDate: string }): Promise<void> => {
  const body: DismissDripFeedbackRequestDto = { placed_date: input.placedDate };
  if (IS_LIBRARY_API_MOCKED) {
    await mockDismissDripFeedback(body);
    return;
  }
  await apiClient.post(`${BASE_PATH}/dismiss`, body);
};

/** 4.4 이번 주 그만 보기 — 본문 없음. 종료 라벨은 표시하지 않는다(팝업이 바로 닫힌다) */
export const muteDripFeedback = async (): Promise<{ mutedUntil: string }> => {
  const data = IS_LIBRARY_API_MOCKED
    ? await mockMuteDripFeedback()
    : (await apiClient.post<MuteDripFeedbackResponseDto>(`${BASE_PATH}/mute`)).data;
  return { mutedUntil: data.muted_until };
};
