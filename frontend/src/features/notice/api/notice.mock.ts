/**
 * 공지 API mock — 백엔드 통합 전 화면 테스트용 대역이다. 네트워크를 가로채지 않고
 * api 모듈 안에서 구현체만 갈아끼운다(notice.api.ts — career·settings와 동일 관례).
 *
 * 서버 규칙을 그대로 흉내 낸다(settings.md 4.7 · settings-api.md 4.4~4.5):
 * - 정렬 is_pinned DESC, published_at DESC, id DESC — 고정 공지가 먼저, 고정끼리도 최신순
 * - 커서 페이지네이션(불투명 토큰 — 여기서는 정렬된 배열의 오프셋 문자열)
 * - 모르는 id는 404 NOTICE_NOT_FOUND(삭제·미발행)
 *
 * 시나리오 전환(EXPO_PUBLIC_NOTICE_MOCK_SCENARIO):
 * - (기본)     25건(고정 2건) — S8 목록·페이징·S9 상세
 * - empty      0건 — S10 빈 상태
 * - load-fail  목록 첫 조회가 INTERNAL_ERROR로 1회 실패 — S11 전면 오류 + [다시 시도] 성공 경로
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type {
  NoticeDetailResponseDto,
  NoticeListItemDto,
  NoticeListResponseDto,
} from './notice.dto';

const SCENARIO = process.env.EXPO_PUBLIC_NOTICE_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 300;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** fixture 발행 시각의 기준점 — 이 시각에서 n일씩 거슬러 올라간다 */
const BASE_PUBLISHED_AT_MS = Date.UTC(2026, 8, 17, 9, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number): string =>
  new Date(BASE_PUBLISHED_AT_MS - days * DAY_MS).toISOString();

interface MockNoticeSeed {
  title: string;
  body: string;
  isPinned?: boolean;
  /** 기준 시각에서 며칠 전 발행됐는가 */
  daysAgo: number;
}

/**
 * 공지 fixture 25건(고정 2건) — 운영이 실제로 올릴 법한 종류만 담는다(업데이트 안내·이벤트·
 * 정책 변경·장애 사후 안내). 결제·구독 유도 문구는 싣지 않는다(settings-uiux.md 4.7 금지).
 * 본문은 줄바꿈을 보존한 일반 텍스트다 — 마크다운·링크 자동 인식 없음(settings.md 4.7 규칙 5).
 */
const NOTICE_SEEDS: readonly MockNoticeSeed[] = [
  {
    title: '9월 업데이트 안내 — 콘텐츠 상세 화면이 생겼어요',
    isPinned: true,
    daysAgo: 0,
    body: '안녕하세요, 이어 팀입니다.\n\n이번 업데이트에서 달라진 점을 안내드려요.\n\n1. 더보기 메뉴에 [상세 정보]가 추가됐어요. 시리즈 구성과 원문 출처를 한 화면에서 볼 수 있어요.\n2. 라이브러리에서 제목·저자로 검색할 수 있어요.\n3. 미니플레이어 전환 애니메이션이 부드러워졌어요.\n\n앱을 최신 버전으로 유지하면 자동으로 적용돼요.\n\n감사합니다.',
  },
  {
    title: '서비스 이용약관 개정 안내 (10월 1일 시행)',
    isPinned: true,
    daysAgo: 3,
    body: '이어 서비스 이용약관이 2026년 10월 1일부로 개정돼요.\n\n주요 변경 사항\n- 제7조(콘텐츠 이용): AI 생성 콘텐츠의 출처 표기 원칙을 명시했어요.\n- 제12조(서비스 중단): 정기 점검 사전 고지 기간을 3일에서 7일로 늘렸어요.\n\n개정된 약관은 설정 > 정보 > 이용약관에서 전문을 확인할 수 있어요.\n시행일 이후에도 서비스를 계속 이용하시면 개정 약관에 동의한 것으로 봐요.',
  },
  {
    title: '9월 16일 오전 재생 지연 장애 안내',
    daysAgo: 1,
    body: '9월 16일 오전 8시 40분부터 9시 15분까지 약 35분간 일부 사용자에게 재생이 늦게 시작되는 문제가 있었어요.\n\n원인\n오디오 전송 서버의 캐시 갱신 과정에서 응답이 지연됐어요.\n\n조치\n캐시 갱신 방식을 바꿔 같은 문제가 재발하지 않도록 했어요.\n\n불편을 드려 죄송합니다.',
  },
  {
    title: '추석 연휴 고객 문의 응대 안내',
    daysAgo: 2,
    body: '추석 연휴(10월 3일~10월 6일) 동안 고객 문의 응대가 쉬어요.\n\n연휴 중 접수된 문의는 10월 7일부터 순차적으로 답변드려요.\n서비스는 연휴 중에도 정상 이용할 수 있어요.\n\n즐거운 명절 보내세요.',
  },
  {
    title: '새 주제 "공간·건축"이 추가됐어요',
    daysAgo: 4,
    body: '관심 주제에 "공간·건축"이 추가됐어요.\n\n도시 설계, 주거 트렌드, 건축가 이야기를 다뤄요.\n설정 > 콘텐츠 > 관심 주제에서 담아두면 이어 PICK에 반영돼요.',
  },
  {
    title: '이어 PICK 편성 시각이 바뀌었어요',
    daysAgo: 6,
    body: '이어 PICK이 도착하는 시각이 오전 7시에서 오전 6시로 앞당겨졌어요.\n\n출근길에 바로 들을 수 있도록 조정했어요.\n알림을 켜두면 편성 완료 시 알려드려요.',
  },
  {
    title: '안드로이드 백그라운드 재생 끊김 수정',
    daysAgo: 8,
    body: '일부 안드로이드 기기에서 화면을 끄면 재생이 멈추던 문제를 수정했어요.\n\n영향 기기: 배터리 최적화가 강하게 적용된 일부 모델\n\n문제가 계속되면 기기 설정에서 이어 앱의 배터리 최적화를 해제해 주세요.',
  },
  {
    title: '9월 9일 정기 점검 완료',
    daysAgo: 8,
    body: '9월 9일 새벽 2시부터 4시까지 예정됐던 정기 점검이 예정대로 끝났어요.\n\n점검 내용\n- 데이터베이스 버전 업그레이드\n- 오디오 저장소 정리\n\n이용에 불편을 드려 죄송합니다.',
  },
  {
    title: '9월 9일 새벽 정기 점검 예정 안내',
    daysAgo: 12,
    body: '9월 9일(화) 새벽 2시부터 4시까지 정기 점검이 진행돼요.\n\n점검 중에는 로그인과 재생이 제한돼요.\n점검 시간은 상황에 따라 앞뒤로 조금 달라질 수 있어요.',
  },
  {
    title: '재생 배속 3.0배가 추가됐어요',
    daysAgo: 14,
    body: '플레이어 배속에 3.0배가 추가됐어요.\n\n설정 > 재생 > 기본 배속에서 미리 정해두면 모든 콘텐츠에 적용돼요.\n빠른 배속에서 음성이 뭉개지는 문제도 함께 개선했어요.',
  },
  {
    title: '개인정보처리방침 개정 안내 (9월 1일 시행)',
    daysAgo: 20,
    body: '개인정보처리방침이 2026년 9월 1일부로 개정됐어요.\n\n변경 사항\n- 추천 정확도를 위해 수집하는 커리어 정보(직군·직무·연차)의 이용 목적을 명시했어요.\n- 탈퇴 시 재생 기록 보관 기간을 명확히 했어요.\n\n전문은 설정 > 정보 > 개인정보처리방침에서 확인할 수 있어요.',
  },
  {
    title: '이어 PICK 편성 지연 사후 안내 (8월 27일)',
    daysAgo: 21,
    body: '8월 27일 오전 이어 PICK이 평소보다 약 2시간 늦게 도착했어요.\n\n원인\n편성 작업이 이전 작업 완료를 기다리다 밀렸어요.\n\n조치\n작업 간 대기 상한을 두어 같은 상황에서도 편성이 미뤄지지 않게 했어요.\n\n불편을 드려 죄송합니다.',
  },
  {
    title: '커리어 정보 입력 기능이 추가됐어요',
    daysAgo: 25,
    body: '직군·직무·연차를 입력하면 추천이 더 정확해져요.\n\n프로필 > 커리어 정보 또는 설정 > 콘텐츠 > 커리어 정보에서 입력할 수 있어요.\n입력한 정보는 추천에만 쓰이고 다른 사용자에게 보이지 않아요.',
  },
  {
    title: '8월 업데이트 안내 — 탐색 검색',
    daysAgo: 30,
    body: '탐색 탭 상단에 검색이 생겼어요.\n\n제목·주제·저자로 찾을 수 있고, 결과에서 바로 담을 수 있어요.\n검색 결과가 없을 때는 관련 주제를 제안해 드려요.',
  },
  {
    title: '이메일 인증 메일이 늦게 도착하던 문제 수정',
    daysAgo: 33,
    body: '일부 메일 서비스에서 인증 코드 메일이 5분 이상 늦게 도착하던 문제를 수정했어요.\n\n발송 경로를 바꿔 대부분의 경우 1분 안에 도착해요.\n여전히 늦으면 스팸함을 확인해 주세요.',
  },
  {
    title: '콘텐츠 원문 링크 표시 방식이 바뀌었어요',
    daysAgo: 36,
    body: '콘텐츠 상세와 플레이어에서 원문 출처를 더 잘 보이게 바꿨어요.\n\n출처 링크를 누르면 외부 브라우저에서 원문이 열려요.\n파트너 콘텐츠는 출처 표기가 필수라 항상 표시돼요.',
  },
  {
    title: '8월 12일 로그인 오류 사후 안내',
    daysAgo: 36,
    body: '8월 12일 오후 3시부터 3시 20분까지 카카오 로그인이 실패하던 문제가 있었어요.\n\n원인\n외부 인증 서버의 일시적 응답 오류였어요.\n\n조치\n인증 실패 시 자동으로 한 번 더 시도하도록 바꿨어요.',
  },
  {
    title: '새 주제 "건강·운동"이 추가됐어요',
    daysAgo: 40,
    body: '관심 주제에 "건강·운동"이 추가됐어요.\n\n운동 루틴, 수면, 식단 이야기를 다뤄요.\n관심 주제에 담아두면 이어 PICK에 반영돼요.',
  },
  {
    title: '삭제한 콘텐츠 되돌리기가 생겼어요',
    daysAgo: 45,
    body: '라이브러리에서 콘텐츠를 지우면 5초 동안 [실행 취소]로 되돌릴 수 있어요.\n\n실수로 지운 콘텐츠를 다시 담을 필요가 없어요.',
  },
  {
    title: '7월 업데이트 안내 — 프로필 통계',
    daysAgo: 50,
    body: '프로필에서 주간 청취 통계를 볼 수 있어요.\n\n청취 시간, 완청 수, 자주 들은 주제를 주 단위로 확인할 수 있어요.\n이전 주로 넘겨 지난 기록도 볼 수 있어요.',
  },
  {
    title: '7월 22일 새벽 정기 점검 예정 안내',
    daysAgo: 60,
    body: '7월 22일(화) 새벽 2시부터 3시까지 정기 점검이 진행돼요.\n\n점검 중에는 로그인과 재생이 제한돼요.',
  },
  {
    title: '재생 위치 저장이 더 정확해졌어요',
    daysAgo: 66,
    body: '앱을 닫았다 열어도 마지막으로 듣던 위치에서 이어 들을 수 있어요.\n\n오프라인 상태에서 들은 위치도 온라인 복귀 시 저장돼요.',
  },
  {
    title: '이어 팀 소식 — 오픈 베타를 시작했어요',
    daysAgo: 75,
    body: '이어가 오픈 베타를 시작했어요.\n\n매일 아침 관심 주제에 맞는 팟캐스트를 골라 드려요.\n베타 기간 동안 불편한 점은 설정 > 문의하기로 알려주세요.',
  },
  {
    title: '알림 권한 안내 화면이 추가됐어요',
    daysAgo: 80,
    body: '온보딩 마지막에 알림 권한을 왜 요청하는지 먼저 안내해요.\n\n허용하지 않아도 서비스는 그대로 이용할 수 있고, 설정에서 언제든 켤 수 있어요.',
  },
  {
    title: '베타 테스터 모집 종료 안내',
    daysAgo: 90,
    body: '비공개 베타 테스터 모집이 마감됐어요.\n\n참여해 주신 분들께 감사드려요.\n오픈 베타 일정은 곧 다시 안내드릴게요.',
  },
];

/** id는 seed 순서로 고정한다 — 앱 리로드 후에도 같은 공지가 같은 id로 열린다 */
const toMockId = (index: number): string => `notice-${String(index + 1).padStart(3, '0')}`;

/** mock 서버 행 — 상세 응답과 같은 모양이다(목록 항목은 여기서 잘라 낸다) */
type MockNotice = NoticeDetailResponseDto;

const buildNotices = (): MockNotice[] =>
  NOTICE_SEEDS.map((seed, index) => ({
    id: toMockId(index),
    title: seed.title,
    body: seed.body,
    is_pinned: seed.isPinned ?? false,
    published_at: daysAgo(seed.daysAgo),
    // 갱신 시각은 발행 시각과 같게 둔다 — 화면에 쓰이지 않는 계약 필드다
    updated_at: daysAgo(seed.daysAgo),
  }));

/** 서버 정렬 그대로 — is_pinned DESC, published_at DESC, id DESC(settings-api.md 4.4) */
const sortNotices = (notices: MockNotice[]): MockNotice[] =>
  [...notices].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (a.published_at !== b.published_at) return a.published_at < b.published_at ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

interface MockServerState {
  notices: MockNotice[];
  /** load-fail 시나리오 — 첫 조회만 실패시켜 [다시 시도] 성공 경로까지 검증한다 */
  listFetchFailed: boolean;
}

const initialState = (): MockServerState => ({
  notices: SCENARIO === 'empty' ? [] : sortNotices(buildNotices()),
  listFetchFailed: false,
});

let state = initialState();

export const resetNoticeMock = (): void => {
  state = initialState();
};

const throwLoadFail = (): never => {
  throw new ApiError(
    ERROR_CODES.INTERNAL_ERROR,
    '요청을 처리하지 못했어요. 다시 시도해주세요',
    false,
    null,
    'mock-trace-notice-load-fail',
    500,
  );
};

const toListItem = (notice: MockNotice): NoticeListItemDto => ({
  id: notice.id,
  title: notice.title,
  is_pinned: notice.is_pinned,
  published_at: notice.published_at,
});

/** 커서 → 오프셋. 알 수 없는 커서는 처음부터 — 실서버라면 400이지만 dev 대역에서는 관대하게 둔다 */
const toOffset = (cursor: string | null): number => {
  if (cursor === null) return 0;
  const offset = Number(cursor);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
};

export const mockFetchNotices = async (
  cursor: string | null,
  limit: number,
): Promise<NoticeListResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (SCENARIO === 'load-fail' && !state.listFetchFailed) {
    state.listFetchFailed = true;
    throwLoadFail();
  }
  const offset = toOffset(cursor);
  const page = state.notices.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    items: page.map(toListItem),
    next_cursor: nextOffset < state.notices.length ? String(nextOffset) : null,
  };
};

export const mockFetchNotice = async (noticeId: string): Promise<NoticeDetailResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const notice = state.notices.find((item) => item.id === noticeId);
  if (notice === undefined) {
    // 삭제·미발행 — 실서버의 404 NOTICE_NOT_FOUND와 같은 모양으로 던진다(settings-api.md 4.5)
    throw new ApiError(
      ERROR_CODES.NOTICE_NOT_FOUND,
      '삭제된 공지예요',
      false,
      null,
      'mock-trace-notice-not-found',
      404,
    );
  }
  return { ...notice };
};
