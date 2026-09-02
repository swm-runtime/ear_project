/**
 * 콘텐츠 상세 API mock — GET /contents/:content_id(content-detail-api.md 4.1)의 화면 테스트용
 * 대역이다. 라이브러리·탐색 mock과 같은 관례로, api 모듈 안에서 구현체만 갈아끼운다.
 *
 * 화면 간 정합:
 * - content-1~25는 library mock, content-101~118은 explore mock의 생성 규칙을 재현해
 *   제목·저자·출처·길이가 목록 행과 같게 보이게 한다(explore.mock이 library.mock을 재현한
 *   것과 같은 방식). 담김 여부·재청취 창은 각 mock 브리지에서 매 응답 시점에 다시 읽는다.
 * - origin·source_url 규칙은 player mock이 소유한다(isMockAiGeneratedContent ·
 *   getMockSourceUrl — 2026-08-24 통일). 발급·목록·상세가 같은 규칙을 봐야 같은 콘텐츠의
 *   [원문 보기] 유무가 화면마다 어긋나지 않는다.
 * - 상세 전용 필드(소개·발행일·시리즈·소스 목록)는 seq에서 결정적으로 파생한다.
 *   ai_generated 콘텐츠의 저자·출처 문자열 표기는 목록 mock(전부 partner 모양)과 어긋난다
 *   — 목록 mock이 고지 문구를 모르는 한계이며 화면 검증에는 영향 없다.
 *
 * 상세 전용 케이스:
 * - content-104  partner · 시리즈 · 탐색 전용(미담김) — CD1 최대 구성
 * - content-8    ai_generated · 시리즈 · 라이브러리 담김 — CD2 + 시리즈 조합
 * - content-12   회수 시뮬레이션(403) — 다른 mock과 같은 콘텐츠(CD4)
 *
 * 시나리오 전환(EXPO_PUBLIC_CONTENT_DETAIL_MOCK_SCENARIO):
 * - (기본)  위 콘텐츠 풀 — 정상·회수·404 검증
 * - error   모든 조회가 500 실패 — CD3 전면 에러 + [다시 시도] 검증
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import { getMockLibraryItemByContentId } from '@/features/library';
import {
  getMockSourceUrl,
  isMockAiGeneratedContent,
  isMockCountedToday,
} from '@/features/player';

import type {
  ContentDetailContentDto,
  ContentDetailResponseDto,
  ContentDetailSourceDto,
} from './content-detail.dto';

const SCENARIO = process.env.EXPO_PUBLIC_CONTENT_DETAIL_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;

/** 파트너 회수 시뮬레이션 — library·explore·player mock의 재생·담기 403과 같은 콘텐츠다 */
const WITHDRAWN_CONTENT_ID = 'content-12';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** library·explore mock의 5개 순환과 동일해야 content-1~25·101~118 메타가 재현된다 */
const POOL_TOPICS = [
  { id: 'topic-career', name: '커리어' },
  { id: 'topic-productivity', name: '생산성' },
  { id: 'topic-tech', name: 'IT·테크' },
  { id: 'topic-ai', name: '인공지능' },
  { id: 'topic-psychology', name: '심리' },
];

/** 목록 mock이 노출하는 콘텐츠 id 범위 — 밖의 id는 404다(content-detail-api.md 4.1) */
const isKnownContentSeq = (seq: number): boolean =>
  (seq >= 1 && seq <= 25) || (seq >= 101 && seq <= 118);

/** CD2 검증용 소스 3건 — 저자만·링크만·둘 다(조건부 변형 전수 — uiux 4.6과 같은 구성) */
const makeSources = (seq: number, topicName: string): ContentDetailSourceDto[] => [
  { title: '딥 워크', author: '칼 뉴포트', url: null },
  { title: `${topicName} 연구 노트 ${seq}`, author: null, url: `https://blog.example.com/notes/${seq}` },
  { title: '몰입을 부르는 환경 설계', author: '정민아', url: 'https://blog.example.com/deep-focus' },
];

const makeContent = (seq: number): ContentDetailContentDto => {
  const contentId = `content-${seq}`;
  const topic = POOL_TOPICS[seq % POOL_TOPICS.length];
  const isExploreOnly = seq >= 101;
  // origin 규칙은 player mock 소유다(파일 주석) — 시리즈만 여기서 seq로 파생한다
  const isAiGenerated = isMockAiGeneratedContent(contentId);
  const hasSeries = seq % 6 === 2;
  const sources = isAiGenerated ? makeSources(seq, topic.name) : null;

  return {
    id: contentId,
    // 제목·길이 생성 규칙은 목록 mock과 동일해야 한다(위 파일 주석 — 화면 간 정합)
    title: isExploreOnly
      ? `${topic.name} 특집 ${seq} — 탐색에서 만나는 이야기`
      : `${topic.name} 이야기 ${seq} — 오래 일하는 사람들의 습관`,
    description:
      `오래 일하는 사람들은 무엇이 다를까요? ${topic.name} 관점에서 일과 삶의 리듬을 지키는 ` +
      `습관을 하나씩 짚어봅니다. 출근길 한 편으로 듣기 좋게 정리했어요.`,
    duration_sec: isExploreOnly ? 480 + (seq % 5) * 120 : 240 + (seq % 5) * 30,
    published_at: new Date(Date.UTC(2026, 7, 20, 5, 0) - seq * 24 * 60 * 60 * 1000).toISOString(),
    thumbnail_url: `https://picsum.photos/seed/${contentId}/200`,
    content_version: 1,
    // 주제 태그 — 첫 번째가 목록 mock의 topic_ids와 같은 주제다. 일부는 2개로 복수 태그를 검증한다
    topics: seq % 3 === 0 ? [topic, POOL_TOPICS[(seq + 2) % POOL_TOPICS.length]] : [topic],
    series: hasSeries
      ? { series_id: `series-${seq}`, episode_no: (seq % 3) + 1, total_episodes: 3 }
      : null,
    origin: isAiGenerated ? 'ai_generated' : 'partner',
    author_name: isAiGenerated ? null : `저자 ${seq}`,
    // ai_generated의 source_name은 고지 문구 표기다 — 상세 출처 영역에는 쓰지 않는다(api 4.1)
    source_name: isAiGenerated
      ? `『딥 워크』(칼 뉴포트) 외 ${(sources?.length ?? 1) - 1}건`
      : seq % 2 === 0
        ? '폴인'
        : '롱블랙',
    // 발급 응답(player mock)과 같은 값이어야 한다 — 규칙·URL 모양을 한 곳에서 가져온다
    source_url: getMockSourceUrl(contentId),
    sources,
  };
};

export const mockFetchContentDetail = async (
  contentId: string,
): Promise<ContentDetailResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  // CD3 전면 에러 검증 — retryable=false로 두어 재시도 지연 없이 즉시 실패한다
  if (SCENARIO === 'error') {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      '일시적인 오류가 발생했어요',
      false,
      null,
      null,
      500,
    );
  }

  // 회수·만료 — 상세를 내려주지 않는다(content-detail-api.md 서버 처리 2)
  if (contentId === WITHDRAWN_CONTENT_ID) {
    throw new ApiError(
      ERROR_CODES.CONTENT_WITHDRAWN,
      '제공이 종료된 콘텐츠예요',
      false,
      null,
      null,
      403,
    );
  }

  const seq = Number(contentId.replace('content-', ''));
  if (!contentId.startsWith('content-') || !isKnownContentSeq(seq)) {
    throw new ApiError(
      ERROR_CODES.CONTENT_NOT_FOUND,
      '콘텐츠를 찾을 수 없어요',
      false,
      null,
      null,
      404,
    );
  }

  // 담김·재청취 창은 저장하지 않고 매 응답에서 브리지로 다시 읽는다 — 서버 조인의 대역
  const libraryState = getMockLibraryItemByContentId(contentId);
  return {
    content: makeContent(seq),
    library_item: libraryState
      ? { id: libraryState.item_id, source: libraryState.source, status: libraryState.status }
      : null,
    is_counted_today: isMockCountedToday(contentId),
  };
};
