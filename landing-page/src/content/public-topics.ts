/**
 * 랜딩의 "고를 수 있는 주제" — **관리자 콘솔에서 공개한 주제를 빌드할 때 받아 온다**(2026-09-17).
 *
 * 원천은 백엔드 `GET /public/topics`(docs/spec/api/public-api.md)다. 정적 내보내기라 이 fetch는
 * `next build` 때 한 번 돌고 결과가 HTML에 박힌다. 랜딩은 매일 자동으로 다시 빌드되므로
 * (`.github/workflows/landing-daily-rebuild.yml`) 관리자에서 주제를 공개·숨기면 늦어도 다음 날 반영된다.
 *
 * **실패해도 빌드를 멈추지 않는다** — 네트워크·API 장애, 아직 엔드포인트가 배포되지 않은 환경,
 * 공개 주제가 0개인 경우에는 아래 기본 목록을 그린다. 기본 목록은 주제 체계(2026-09-06 개편,
 * `docs/changes/archive/topic-taxonomy-v2.md`)를 옮긴 것이다.
 */

export type TopicGroup = { name: string; topics: string[] };

/** 폴백은 개발계다 — 랜딩은 `dev` 머지만으로 배포·확인한다(`site.ts`의 PUBLIC_API_BASE_URL 주석, 2026-09-18) */
const DEFAULT_API_BASE_URL = "https://api-dev.earcast.co.kr/api/v1";
const FETCH_TIMEOUT_MS = 5_000;

const fallbackTopicGroups: TopicGroup[] = [
  { name: "돈·경제", topics: ["재테크", "투자", "경제 상식", "부동산"] },
  {
    name: "일",
    topics: ["커리어", "생산성", "리더십", "커뮤니케이션", "조직"],
  },
  { name: "비즈니스", topics: ["경영", "마케팅", "스타트업", "트렌드"] },
  { name: "과학·기술", topics: ["데이터·AI", "IT·개발", "자연과학"] },
  {
    name: "심리·마음",
    topics: ["심리학", "뇌과학·인지", "습관·동기", "인간관계"],
  },
  { name: "인문·교양", topics: ["철학", "역사", "사회·문화", "예술"] },
  {
    name: "자격증·시험",
    topics: ["TOPCIT", "한능검", "공인중개사", "산업안전기사"],
  },
];

type PublicTopicsResponse = {
  groups?: { name?: unknown; topics?: { name?: unknown }[] }[];
};

export async function getTopicGroups(): Promise<TopicGroup[]> {
  const baseUrl = (
    process.env.LANDING_API_BASE_URL ?? DEFAULT_API_BASE_URL
  ).replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/public/topics`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const groups = parseGroups((await response.json()) as PublicTopicsResponse);

    if (groups.length === 0) {
      throw new Error("no public topics");
    }

    return groups;
  } catch (error) {
    // 빌드 로그에 남기고 기본 목록으로 간다 — 랜딩이 API 때문에 못 나가면 안 된다
    console.warn(
      `[public-topics] 기본 주제 목록을 씁니다: ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallbackTopicGroups;
  }
}

/** 형식이 어긋난 값은 조용히 버린다 — 이름이 문자열인 것만 남긴다 */
function parseGroups(body: PublicTopicsResponse): TopicGroup[] {
  return (body.groups ?? [])
    .map((group) => ({
      name: typeof group.name === "string" ? group.name : "",
      topics: (group.topics ?? [])
        .map((topic) => topic.name)
        .filter(
          (name): name is string => typeof name === "string" && name.length > 0,
        ),
    }))
    .filter((group) => group.name.length > 0 && group.topics.length > 0);
}
