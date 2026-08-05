/**
 * 온보딩 화면을 끝까지 돌려보기 위한 **개발용 목 데이터**다.
 *
 * MVP의 콘텐츠·주제는 관리자 업로드(FR-37·FR-38)로 들어오지만 그 기능이 아직 없어서,
 * 프론트엔드가 1~3단계를 실제로 밟아볼 수 없다. 이 파일은 그 공백을 메우는 임시 데이터이며
 * **운영 데이터가 아니다** — 마이그레이션이 아니라 별도 시드 스크립트로 분리한 이유다.
 * 관리자 업로드가 생기면 이 파일과 스크립트를 지운다.
 */

export interface MockTopic {
  name: string;
  parentCategory: string;
  displayOrder: number;
}

export interface MockContent {
  title: string;
  description: string;
  authorName: string;
  sourceName: string;
  durationSec: number;
  topicNames: string[];
  /** 시리즈물 — 첫 편만 추천·편성 후보에 오르는지 확인용 */
  seriesKey?: string;
  episodeNo?: number;
  totalEpisodes?: number;
  /** 직전 확정 월의 재생 수. 0이면 그 달 집계 행을 만들지 않는다 */
  lastMonthPlayCount: number;
  /** 전체 구간 누적 재생 수 — 추천·편성의 인기 정렬 근거 */
  allTimePlayCount: number;
}

export const MOCK_TOPICS: MockTopic[] = [
  { name: '커리어', parentCategory: '일', displayOrder: 1 },
  { name: '생산성', parentCategory: '일', displayOrder: 2 },
  { name: '리더십', parentCategory: '일', displayOrder: 3 },
  { name: '커뮤니케이션', parentCategory: '일', displayOrder: 4 },
  { name: '재테크', parentCategory: '돈', displayOrder: 5 },
  { name: '경제 상식', parentCategory: '돈', displayOrder: 6 },
  { name: '글쓰기', parentCategory: '배움', displayOrder: 7 },
  { name: '데이터·AI', parentCategory: '배움', displayOrder: 8 },
  { name: '심리학', parentCategory: '배움', displayOrder: 9 },
  { name: '인문·교양', parentCategory: '배움', displayOrder: 10 },
];

export const MOCK_CONTENTS: MockContent[] = [
  // --- 커리어 ---
  {
    title: '이직을 결심하기 전에 확인할 다섯 가지',
    description: '연봉만 보고 옮기면 1년 뒤 같은 고민을 반복한다.',
    authorName: '김정민',
    sourceName: '퍼블리',
    durationSec: 743,
    topicNames: ['커리어'],
    lastMonthPlayCount: 12,
    allTimePlayCount: 48,
  },
  {
    title: '주니어가 3년 차에 가장 많이 하는 착각',
    description: '숙련도와 성장은 같은 말이 아니다.',
    authorName: '이서현',
    sourceName: '퍼블리',
    durationSec: 812,
    topicNames: ['커리어', '심리학'],
    lastMonthPlayCount: 9,
    allTimePlayCount: 41,
  },
  {
    title: '연봉 협상, 숫자보다 순서가 중요하다',
    description: '먼저 말하는 쪽이 지는 게임이 아니다.',
    authorName: '박도현',
    sourceName: '이어 오리지널',
    durationSec: 664,
    topicNames: ['커리어', '커뮤니케이션'],
    lastMonthPlayCount: 7,
    allTimePlayCount: 33,
  },
  {
    title: '커리어 포트폴리오를 매달 갱신하는 법',
    description: '기억은 사라지고 기록만 남는다.',
    authorName: '최유진',
    sourceName: '이어 오리지널',
    durationSec: 590,
    topicNames: ['커리어', '생산성'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 21,
  },

  // --- 생산성 (시리즈 포함) ---
  {
    title: '시간 관리의 재발견 1편 — 우선순위는 감이 아니다',
    description: '할 일 목록이 길어질수록 결정은 미뤄진다.',
    authorName: '한지우',
    sourceName: '퍼블리',
    durationSec: 705,
    topicNames: ['생산성'],
    seriesKey: 'time-management',
    episodeNo: 1,
    totalEpisodes: 3,
    lastMonthPlayCount: 6,
    allTimePlayCount: 37,
  },
  {
    title: '시간 관리의 재발견 2편 — 집중 블록 설계하기',
    description: '하루를 시간이 아니라 블록으로 쪼갠다.',
    authorName: '한지우',
    sourceName: '퍼블리',
    durationSec: 688,
    topicNames: ['생산성'],
    seriesKey: 'time-management',
    episodeNo: 2,
    totalEpisodes: 3,
    lastMonthPlayCount: 0,
    allTimePlayCount: 14,
  },
  {
    title: '시간 관리의 재발견 3편 — 회고가 없으면 반복된다',
    description: '주간 회고 15분이 다음 주를 바꾼다.',
    authorName: '한지우',
    sourceName: '퍼블리',
    durationSec: 651,
    topicNames: ['생산성'],
    seriesKey: 'time-management',
    episodeNo: 3,
    totalEpisodes: 3,
    lastMonthPlayCount: 0,
    allTimePlayCount: 11,
  },
  {
    title: '멀티태스킹은 왜 항상 실패하는가',
    description: '전환 비용은 눈에 보이지 않아서 더 비싸다.',
    authorName: '오세영',
    sourceName: '이어 오리지널',
    durationSec: 612,
    topicNames: ['생산성', '심리학'],
    lastMonthPlayCount: 5,
    allTimePlayCount: 29,
  },

  // --- 리더십 ---
  {
    title: '처음 팀장이 된 사람에게',
    description: '잘하던 일을 놓는 것이 첫 번째 일이다.',
    authorName: '정하늘',
    sourceName: '퍼블리',
    durationSec: 776,
    topicNames: ['리더십'],
    lastMonthPlayCount: 8,
    allTimePlayCount: 39,
  },
  {
    title: '피드백을 주는 사람의 언어',
    description: '평가가 아니라 관찰을 말한다.',
    authorName: '정하늘',
    sourceName: '퍼블리',
    durationSec: 702,
    topicNames: ['리더십', '커뮤니케이션'],
    lastMonthPlayCount: 4,
    allTimePlayCount: 26,
  },
  {
    title: '위임이 어려운 진짜 이유',
    description: '내가 하면 빠르다는 생각이 팀을 멈춘다.',
    authorName: '문가영',
    sourceName: '이어 오리지널',
    durationSec: 634,
    topicNames: ['리더십'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 18,
  },
  {
    title: '1on1을 형식적으로 만들지 않으려면',
    description: '질문 세 개면 충분하다.',
    authorName: '문가영',
    sourceName: '이어 오리지널',
    durationSec: 598,
    topicNames: ['리더십', '커뮤니케이션'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 15,
  },

  // --- 커뮤니케이션 ---
  {
    title: '설득은 논리가 아니라 순서다',
    description: '상대가 듣는 순간을 먼저 만든다.',
    authorName: '배준호',
    sourceName: '퍼블리',
    durationSec: 721,
    topicNames: ['커뮤니케이션'],
    lastMonthPlayCount: 6,
    allTimePlayCount: 31,
  },
  {
    title: '거절을 잘하는 사람들의 문장',
    description: '거절은 관계를 끊는 말이 아니다.',
    authorName: '배준호',
    sourceName: '퍼블리',
    durationSec: 655,
    topicNames: ['커뮤니케이션', '심리학'],
    lastMonthPlayCount: 3,
    allTimePlayCount: 24,
  },
  {
    title: '회의에서 말이 겉도는 이유',
    description: '결론부터 말하지 않으면 아무도 안 듣는다.',
    authorName: '신유나',
    sourceName: '이어 오리지널',
    durationSec: 583,
    topicNames: ['커뮤니케이션', '생산성'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 17,
  },

  // --- 재테크 ---
  {
    title: '월급쟁이의 첫 자산 배분',
    description: '수익률보다 비중이 먼저다.',
    authorName: '남기훈',
    sourceName: '퍼블리',
    durationSec: 834,
    topicNames: ['재테크'],
    lastMonthPlayCount: 11,
    allTimePlayCount: 52,
  },
  {
    title: '연금 계좌, 지금 열어야 하는 이유',
    description: '세액공제는 기다려주지 않는다.',
    authorName: '남기훈',
    sourceName: '퍼블리',
    durationSec: 767,
    topicNames: ['재테크', '경제 상식'],
    lastMonthPlayCount: 5,
    allTimePlayCount: 34,
  },
  {
    title: '집을 사기 전에 계산해야 할 숫자',
    description: '이자보다 무서운 것은 유동성이다.',
    authorName: '류지원',
    sourceName: '이어 오리지널',
    durationSec: 902,
    topicNames: ['재테크'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 27,
  },

  // --- 경제 상식 ---
  {
    title: '금리가 오르면 내 통장에서 벌어지는 일',
    description: '뉴스의 숫자를 내 생활로 번역한다.',
    authorName: '류지원',
    sourceName: '퍼블리',
    durationSec: 688,
    topicNames: ['경제 상식'],
    lastMonthPlayCount: 4,
    allTimePlayCount: 30,
  },
  {
    title: '환율은 누가 정하는가',
    description: '시장이라는 말로 넘어가지 않기.',
    authorName: '임세찬',
    sourceName: '이어 오리지널',
    durationSec: 714,
    topicNames: ['경제 상식', '인문·교양'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 19,
  },
  {
    title: '인플레이션을 체감으로 이해하기',
    description: '장바구니가 알려주는 경제학.',
    authorName: '임세찬',
    sourceName: '이어 오리지널',
    durationSec: 640,
    topicNames: ['경제 상식'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 16,
  },

  // --- 글쓰기 ---
  {
    title: '읽히는 글의 첫 문장',
    description: '첫 문장은 요약이 아니라 초대다.',
    authorName: '고은비',
    sourceName: '퍼블리',
    durationSec: 626,
    topicNames: ['글쓰기'],
    lastMonthPlayCount: 7,
    allTimePlayCount: 36,
  },
  {
    title: '업무 문서를 짧게 쓰는 훈련',
    description: '길이를 줄이면 생각이 드러난다.',
    authorName: '고은비',
    sourceName: '퍼블리',
    durationSec: 571,
    topicNames: ['글쓰기', '생산성'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 22,
  },
  {
    title: '기록하는 사람이 결국 남는다',
    description: '쓰지 않은 경험은 사라진다.',
    authorName: '서다인',
    sourceName: '이어 오리지널',
    durationSec: 693,
    topicNames: ['글쓰기', '커리어'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 13,
  },

  // --- 데이터·AI ---
  {
    title: '비개발자를 위한 데이터 읽는 법',
    description: '평균은 자주 거짓말을 한다.',
    authorName: '윤태경',
    sourceName: '퍼블리',
    durationSec: 758,
    topicNames: ['데이터·AI'],
    lastMonthPlayCount: 10,
    allTimePlayCount: 44,
  },
  {
    title: 'AI를 도구로 쓰는 사람들의 습관',
    description: '질문의 품질이 결과의 품질이다.',
    authorName: '윤태경',
    sourceName: '이어 오리지널',
    durationSec: 802,
    topicNames: ['데이터·AI', '생산성'],
    lastMonthPlayCount: 6,
    allTimePlayCount: 38,
  },
  {
    title: '지표를 만들 때 빠지는 함정',
    description: '측정되는 순간 행동이 바뀐다.',
    authorName: '강민석',
    sourceName: '이어 오리지널',
    durationSec: 671,
    topicNames: ['데이터·AI', '리더십'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 20,
  },

  // --- 심리학 ---
  {
    title: '번아웃은 게으름의 반대말이다',
    description: '무너지기 전에 나타나는 신호들.',
    authorName: '조하람',
    sourceName: '퍼블리',
    durationSec: 745,
    topicNames: ['심리학'],
    lastMonthPlayCount: 9,
    allTimePlayCount: 46,
  },
  {
    title: '비교를 멈추지 못하는 뇌',
    description: '사회적 비교는 본능이지 결함이 아니다.',
    authorName: '조하람',
    sourceName: '퍼블리',
    durationSec: 688,
    topicNames: ['심리학', '인문·교양'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 25,
  },
  {
    title: '미루기의 심리학',
    description: '게으름이 아니라 감정 조절의 문제다.',
    authorName: '백서진',
    sourceName: '이어 오리지널',
    durationSec: 617,
    topicNames: ['심리학', '생산성'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 23,
  },

  // --- 인문·교양 ---
  {
    title: '고전을 지금 읽어야 하는 이유',
    description: '오래된 질문일수록 오래 쓸모 있다.',
    authorName: '노진우',
    sourceName: '퍼블리',
    durationSec: 821,
    topicNames: ['인문·교양'],
    lastMonthPlayCount: 3,
    allTimePlayCount: 28,
  },
  {
    title: '도시를 읽는 법',
    description: '길의 모양에는 이유가 있다.',
    authorName: '노진우',
    sourceName: '이어 오리지널',
    durationSec: 764,
    topicNames: ['인문·교양'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 12,
  },
  {
    title: '질문하는 법을 잃어버린 사회',
    description: '정답을 빨리 찾을수록 질문은 줄어든다.',
    authorName: '유선아',
    sourceName: '이어 오리지널',
    durationSec: 709,
    topicNames: ['인문·교양', '커뮤니케이션'],
    lastMonthPlayCount: 0,
    allTimePlayCount: 10,
  },
];
