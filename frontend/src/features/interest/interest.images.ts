import type { ImageSourcePropType } from 'react-native';

/**
 * 주제별 배경 사진 — 순수 표현이라 화면이 소유한다(서버 계약에 이미지 필드가 없다).
 * 전부 CC0/퍼블릭 도메인(Openverse 검색, 출처 표시 불요)이라 번들에 포함해도 문제없다.
 *
 * **키는 `slug`가 먼저, 한국어 이름이 폴백이다**(KAN-195 — global-api.md 4.5).
 * - 처음엔 id 로 잡았다가 mock(`topic-economy`)과 서버(UUID)가 달라 전부 기본 사진으로 떨어졌고(2026-09-06),
 *   이름으로 바꿨다. 그런데 이름은 시장마다 달라 영어(GLOBAL) 주제에는 하나도 안 붙는다 — 그래서 서버가
 *   시장 무관 안정 키 `slug`를 내려준다.
 * - KR 주제의 slug 는 서버 운영 데이터 입력(BE KAN-212) 전까지 `null`이다. 그동안 KR 화면이 기본 사진으로
 *   바뀌지 않게 **이름 키 표를 폴백으로 남긴다.** KAN-212 입력이 운영에 반영된 뒤 이름 표를 지운다.
 *
 * **파일명을 slug 에서 만들지 않는다**(`topic-${slug}.jpg` 금지). 재테크는 `topic-investing.jpg`인데 slug 가
 * `personal-finance`이고, 투자는 `topic-invest.jpg`인데 slug 가 `investing`이다 — 파일명 규칙으로 풀면
 * 투자 칩에 재테크 사진이 붙는다(KAN-212 ⚠️). 그래서 slug → 사진을 표로 명시한다.
 *
 * 목록에 없는 주제(관리자가 새로 추가한 주제)는 기본 사진으로 떨어진다 — 그때 여기에 더한다.
 *
 * **GLOBAL 주제 사진 8장의 출처**(2026-10-19 KAN-195 — 같은 절차: Openverse CC0/퍼블릭 도메인, 800x320, 품질 80).
 * 얼굴이 주인공인 사진·실존 인물(아이돌·배우)·글자/로고가 박힌 사진은 걸렀다. 단 한국어는 한글이 곧 주제라 한글 서예를 쓴다.
 * 알약 폭이 라벨에 맞춰 달라지므로(2026-10-19 PM) 좁게 잘려도 피사체가 남도록 가운데 구도를 골랐다.
 * - korean-language — 한글 서예 액자(시): flickr.com/photos/101561334@N08/16650985822 · CC0
 * - k-food — 놋그릇 비빔밥: rawpixel.com/image/5925809 · CC0
 * - k-pop — 공연장 객석의 손 하트(뒷모습)·무대 조명: stocksnap.io/photo/crowd-people-IUJP9OI22I · CC0
 * - k-drama-film — 빈 영화관 객석과 스크린: rawpixel.com/image/5921209 · CC0
 * - korean-culture — 통도사 연등: rawpixel.com/image/5964832 · CC0
 * - k-beauty-fashion — 동대문 한복 가게 진열: commons.wikimedia.org/w/index.php?curid=89917525 · CC0
 * - korean-history-society — 창덕궁 인정전: flickr.com/photos/101561334@N08/17330752728 · CC0
 * - travel-in-korea — 롯데월드타워와 석촌호수 일몰: rawpixel.com/image/3338160 · CC0
 */
const IMAGE = {
  art: require('../../../assets/topics/topic-art.jpg'),
  career: require('../../../assets/topics/topic-career.jpg'),
  communication: require('../../../assets/topics/topic-communication.jpg'),
  dataAi: require('../../../assets/topics/topic-data-ai.jpg'),
  design: require('../../../assets/topics/topic-design.jpg'),
  economy: require('../../../assets/topics/topic-economy.jpg'),
  habit: require('../../../assets/topics/topic-habit.jpg'),
  history: require('../../../assets/topics/topic-history.jpg'),
  kBeautyFashion: require('../../../assets/topics/topic-k-beauty-fashion.jpg'),
  kDramaFilm: require('../../../assets/topics/topic-k-drama-film.jpg'),
  kFood: require('../../../assets/topics/topic-k-food.jpg'),
  kPop: require('../../../assets/topics/topic-k-pop.jpg'),
  koreanCulture: require('../../../assets/topics/topic-korean-culture.jpg'),
  koreanHistorySociety: require('../../../assets/topics/topic-korean-history-society.jpg'),
  koreanLanguage: require('../../../assets/topics/topic-korean-language.jpg'),
  humanities: require('../../../assets/topics/topic-humanities.jpg'),
  /** 투자 — 파일명이 slug(`investing`)와 다르다 */
  invest: require('../../../assets/topics/topic-invest.jpg'),
  /** 재테크 — 파일명이 slug(`personal-finance`)와 다르고, 투자의 slug 와 같은 이름이다 */
  investing: require('../../../assets/topics/topic-investing.jpg'),
  itDev: require('../../../assets/topics/topic-it-dev.jpg'),
  koreanHistory: require('../../../assets/topics/topic-korean-history.jpg'),
  leadership: require('../../../assets/topics/topic-leadership.jpg'),
  management: require('../../../assets/topics/topic-management.jpg'),
  marketing: require('../../../assets/topics/topic-marketing.jpg'),
  neuro: require('../../../assets/topics/topic-neuro.jpg'),
  organization: require('../../../assets/topics/topic-organization.jpg'),
  philosophy: require('../../../assets/topics/topic-philosophy.jpg'),
  productivity: require('../../../assets/topics/topic-productivity.jpg'),
  psychology: require('../../../assets/topics/topic-psychology.jpg'),
  realEstate: require('../../../assets/topics/topic-real-estate.jpg'),
  relationship: require('../../../assets/topics/topic-relationship.jpg'),
  safety: require('../../../assets/topics/topic-safety.jpg'),
  science: require('../../../assets/topics/topic-science.jpg'),
  society: require('../../../assets/topics/topic-society.jpg'),
  startup: require('../../../assets/topics/topic-startup.jpg'),
  topcit: require('../../../assets/topics/topic-topcit.jpg'),
  travelInKorea: require('../../../assets/topics/topic-travel-in-korea.jpg'),
  trend: require('../../../assets/topics/topic-trend.jpg'),
  worldHistory: require('../../../assets/topics/topic-world-history.jpg'),
  writing: require('../../../assets/topics/topic-writing.jpg'),
} satisfies Record<string, ImageSourcePropType>;

const FALLBACK_IMAGE: ImageSourcePropType = require('../../../assets/topics/default.jpg');

/**
 * slug → 사진. KR slug 는 BE KAN-212 확정 표(2026-10-15)와 같고, 각 slug 는 **같은 주제의 이름 키와 같은 사진**을
 * 가리킨다 — slug 로 바뀌어도 KR 칩이 1.2.0과 똑같이 보여야 한다(interest.images.test.ts가 대조한다).
 *
 * GLOBAL 주제 8개는 slug 로만 찾는다(영어 이름이라 아래 이름 표에 없다). 사진 출처는 위 IMAGE 주석.
 */
const TOPIC_IMAGE_BY_SLUG: Record<string, ImageSourcePropType> = {
  // 돈·경제
  'personal-finance': IMAGE.investing, // 재테크 — topic-investing.jpg
  'economics-basics': IMAGE.economy, // 경제 상식
  investing: IMAGE.invest, // 투자 — topic-invest.jpg
  'real-estate': IMAGE.realEstate, // 부동산
  // 일
  career: IMAGE.career, // 커리어
  productivity: IMAGE.productivity, // 생산성
  leadership: IMAGE.leadership, // 리더십
  communication: IMAGE.communication, // 커뮤니케이션
  organization: IMAGE.organization, // 조직
  'industrial-safety': IMAGE.safety, // 산업안전
  design: IMAGE.design, // 디자인
  // 비즈니스
  marketing: IMAGE.marketing, // 마케팅
  startup: IMAGE.startup, // 스타트업
  trends: IMAGE.trend, // 트렌드
  management: IMAGE.management, // 경영
  // 과학·기술
  'data-ai': IMAGE.dataAi, // 데이터·AI
  'it-dev': IMAGE.itDev, // IT·개발
  'natural-science': IMAGE.science, // 자연과학
  // 심리·마음
  psychology: IMAGE.psychology, // 심리학
  neuroscience: IMAGE.neuro, // 뇌과학·인지
  'habits-motivation': IMAGE.habit, // 습관·동기
  relationships: IMAGE.relationship, // 인간관계
  // 인문·교양
  philosophy: IMAGE.philosophy, // 철학
  history: IMAGE.history, // 역사
  'society-culture': IMAGE.society, // 사회·문화
  art: IMAGE.art, // 예술
  // 자격증·시험 — 시험이 다루는 영역의 사진을 함께 쓴다
  'korean-history-exam': IMAGE.koreanHistory, // 한능검
  'real-estate-agent-exam': IMAGE.realEstate, // 공인중개사
  'industrial-safety-exam': IMAGE.safety, // 산업안전기사
  // 구 체계 잔재 — 같은 영역의 사진을 물려 쓴다
  'career-growth': IMAGE.career, // 커리어 성장
  'job-change-interview': IMAGE.career, // 이직·면접
  'ai-tech-trends': IMAGE.dataAi, // AI·테크 트렌드
  economy: IMAGE.economy, // 경제
  humanities: IMAGE.humanities, // 인문·교양
  writing: IMAGE.writing, // 글쓰기
  'world-history': IMAGE.worldHistory, // 세계사
  // GLOBAL(K-컬처) — 2026-10-19
  'korean-language': IMAGE.koreanLanguage, // Korean Language
  'k-food': IMAGE.kFood, // K-Food
  'k-pop': IMAGE.kPop, // K-Pop
  'k-drama-film': IMAGE.kDramaFilm, // K-Drama & Film
  'korean-culture': IMAGE.koreanCulture, // Korean Culture
  'k-beauty-fashion': IMAGE.kBeautyFashion, // K-Beauty & Fashion
  'korean-history-society': IMAGE.koreanHistorySociety, // Korean History & Society
  'travel-in-korea': IMAGE.travelInKorea, // Travel in Korea
};

/**
 * 한국어 이름 → 사진 — **폴백 전용**(slug 가 `null`이거나 위 표에 없을 때, 그리고 응답에 slug 가 없는 화면).
 * KAN-212 입력이 운영에 반영되고 slug 를 싣지 않는 화면(탐색·라이브러리·프로필·콘텐츠 상세)이 없어지면 지운다.
 * TOPCIT 는 KAN-212 표에 slug 가 없어 이름으로만 찾는다.
 */
const TOPIC_IMAGE_BY_NAME: Record<string, ImageSourcePropType> = {
  // 돈·경제
  재테크: IMAGE.investing,
  '경제 상식': IMAGE.economy,
  투자: IMAGE.invest,
  부동산: IMAGE.realEstate,
  // 일
  커리어: IMAGE.career,
  생산성: IMAGE.productivity,
  리더십: IMAGE.leadership,
  커뮤니케이션: IMAGE.communication,
  조직: IMAGE.organization,
  산업안전: IMAGE.safety,
  디자인: IMAGE.design,
  // 비즈니스
  마케팅: IMAGE.marketing,
  스타트업: IMAGE.startup,
  트렌드: IMAGE.trend,
  경영: IMAGE.management,
  // 과학·기술
  '데이터·AI': IMAGE.dataAi,
  'IT·개발': IMAGE.itDev,
  자연과학: IMAGE.science,
  // 심리·마음
  심리학: IMAGE.psychology,
  '뇌과학·인지': IMAGE.neuro,
  '습관·동기': IMAGE.habit,
  인간관계: IMAGE.relationship,
  // 인문·교양
  철학: IMAGE.philosophy,
  역사: IMAGE.history,
  '사회·문화': IMAGE.society,
  예술: IMAGE.art,
  // 자격증·시험
  TOPCIT: IMAGE.topcit,
  한능검: IMAGE.koreanHistory,
  공인중개사: IMAGE.realEstate,
  산업안전기사: IMAGE.safety,
  // 구 체계 잔재
  '커리어 성장': IMAGE.career,
  '이직·면접': IMAGE.career,
  'AI·테크 트렌드': IMAGE.dataAi,
  경제: IMAGE.economy,
  '인문·교양': IMAGE.humanities,
  글쓰기: IMAGE.writing,
  세계사: IMAGE.worldHistory,
  // GLOBAL(K-컬처) 영어 이름 — slug 를 받지 않는 화면(프로필 관심 주제 카드·탐색 주제 칩·추천 키워드·상세 헤더)도 사진이
  // 붙게(2026-10-19 KAN-228 실기기: GLOBAL 전환 뒤 프로필 원형 사진이 기본 사진으로 나왔다). 서버 시드 이름 그대로
  'Korean Language': IMAGE.koreanLanguage,
  'K-Food': IMAGE.kFood,
  'K-Pop': IMAGE.kPop,
  'K-Drama & Film': IMAGE.kDramaFilm,
  'Korean Culture': IMAGE.koreanCulture,
  'K-Beauty & Fashion': IMAGE.kBeautyFashion,
  'Korean History & Society': IMAGE.koreanHistorySociety,
  'Travel in Korea': IMAGE.travelInKorea,
};

/** 사진 조회 키 — slug 가 있는 응답은 둘 다 넘긴다. slug 를 싣지 않는 화면은 이름만 넘긴다 */
export interface TopicImageKey {
  slug?: string | null;
  name?: string;
}

/** 자기 키만 본다 — slug·이름이 `constructor` 같은 프로토타입 키여도 엉뚱한 값이 나오지 않게 */
const ownLookup = (
  table: Record<string, ImageSourcePropType>,
  key: string | null | undefined,
): ImageSourcePropType | undefined =>
  key && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

/** 주제 배경 사진 조회 — slug → 이름 → 기본 사진 순서. 선택 요약 칩 등 다른 표현이 같은 사진을 쓰게 한다 */
export const topicImageSource = ({ slug, name }: TopicImageKey): ImageSourcePropType =>
  ownLookup(TOPIC_IMAGE_BY_SLUG, slug) ?? ownLookup(TOPIC_IMAGE_BY_NAME, name) ?? FALLBACK_IMAGE;
