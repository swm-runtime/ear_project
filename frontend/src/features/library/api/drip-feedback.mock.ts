/**
 * 추천 별점 API mock(drip-feedback-api.md — KAN-224). 라이브러리 mock 과 같은 스위치(`IS_LIBRARY_API_MOCKED`)로 켜진다.
 *
 * 응답 두 벌(티켓 요청 7):
 * - (기본) `show`   — `show=true`, 가장 최근 편성분 2편
 * - `hidden`        — `show=false`(가입 3일째·이번 주 그만 보기·이미 물음 등 — 사유는 서버만 안다)
 *
 * 시나리오는 `EXPO_PUBLIC_DRIP_FEEDBACK_MOCK_SCENARIO`. 서버처럼 한 번 답하면(별점·닫기·그만 보기) 그 뒤로는
 * `show=false`다 — 앱 리로드 시 초기화된다.
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type {
  DismissDripFeedbackRequestDto,
  DripFeedbackPromptResponseDto,
  MuteDripFeedbackResponseDto,
  SubmitDripFeedbackRequestDto,
} from './library.dto';

const SCENARIO = process.env.EXPO_PUBLIC_DRIP_FEEDBACK_MOCK_SCENARIO ?? 'show';

/** 라이브러리 mock 과 같은 정도의 네트워크 지연 */
const RESPONSE_DELAY_MS = 400;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** mock 편성분 날짜 — 표시·판정에 쓰지 않는 라벨이라 고정값이면 된다 */
const MOCK_PLACED_DATE = '2026-10-16';

export const MOCK_DRIP_FEEDBACK_SHOWN: DripFeedbackPromptResponseDto = {
  show: true,
  placed_date: MOCK_PLACED_DATE,
  muted_until: null,
  items: [
    {
      content_id: 'mock-drip-feedback-1',
      title: '관세는 외국이 내는 세금이 아니다',
      thumbnail_url: 'https://picsum.photos/seed/mock-drip-feedback-1/200',
      language: 'ko',
      source: 'drip',
      placed_date: MOCK_PLACED_DATE,
      library_status: 'unplayed',
    },
    {
      content_id: 'mock-drip-feedback-2',
      title: '금리가 내려도 대출 이자가 안 내리는 이유',
      thumbnail_url: 'https://picsum.photos/seed/mock-drip-feedback-2/200',
      language: 'ko',
      source: 'drip',
      placed_date: MOCK_PLACED_DATE,
      library_status: 'completed',
    },
  ],
};

export const MOCK_DRIP_FEEDBACK_HIDDEN: DripFeedbackPromptResponseDto = {
  show: false,
  placed_date: null,
  muted_until: null,
  items: [],
};

/** 한 번 답했는가 — 서버의 `drip_feedback_last_prompted_date`·`muted_until` 대역 */
let isAnswered = false;

export const mockFetchDripFeedbackPrompt = async (): Promise<DripFeedbackPromptResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (isAnswered || SCENARIO === 'hidden') return MOCK_DRIP_FEEDBACK_HIDDEN;
  return MOCK_DRIP_FEEDBACK_SHOWN;
};

export const mockSubmitDripFeedback = async (body: SubmitDripFeedbackRequestDto): Promise<void> => {
  await delay(RESPONSE_DELAY_MS);
  const rateable = new Set(MOCK_DRIP_FEEDBACK_SHOWN.items.map((item) => item.content_id));
  // 서버와 같이 하나라도 대상이 아니면 전부 거부한다(4.2)
  if (body.ratings.some((rating) => !rateable.has(rating.content_id))) {
    throw new ApiError(
      ERROR_CODES.DRIP_FEEDBACK_NOT_RATEABLE,
      '평가할 수 없는 콘텐츠예요',
      false,
      null,
      null,
      400,
    );
  }
  isAnswered = true;
};

export const mockDismissDripFeedback = async (
  _body: DismissDripFeedbackRequestDto,
): Promise<void> => {
  await delay(RESPONSE_DELAY_MS);
  isAnswered = true;
};

export const mockMuteDripFeedback = async (): Promise<MuteDripFeedbackResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  isAnswered = true;
  return { muted_until: '2026-10-19' };
};
