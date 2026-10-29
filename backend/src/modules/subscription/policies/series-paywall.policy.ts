/**
 * 시리즈 유료화(KAN-290 — 단기 실험 ⑤, `experiments-api.md` 4.2)의 **판정 규칙을 이 파일에만 둔다.**
 *
 * - **잠긴 편** = 시리즈 편(`contents.series_id` 있음)이고 `episode_no > 무료 편수`인 편. 모든 시리즈(글로벌 포함)가 대상이다.
 * - **열리는 사람** = 최상위 유료 요금제(현재 pro — 초대 코드 Pro는 `users.tier`에 pro로 적힌다) 이거나 가입 체험 중인 사용자.
 *   그 밖은 잠긴다. 이미 4편 이후를 듣던 사용자도 예외 없다(KAN-290 결정).
 * - 서버 스위치(`SERIES_PAYWALL_ENABLED`)가 꺼져 있으면 아무것도 잠그지 않는다.
 *
 * 사용자별 판정 결과는 `SeriesEpisodeAccess` 하나로 접는다 — 요청마다 한 번 만들고, 목록의 편마다
 * `isSeriesEpisodeLocked`로 비교만 한다(편마다 사용자·요금제를 다시 읽지 않는다). 재생 게이트·응답 `is_locked`·드립·리텐션 알림이
 * 전부 이 두 함수를 쓴다 — 판정이 두 벌이면 목록에는 열려 보이는데 재생은 막히는 어긋남이 생긴다.
 */

/** 무료 편수 설정값이 비었을 때 — 1~3편은 누구나 듣는다 */
export const DEFAULT_SERIES_FREE_EPISODES = 3;

/** 사용자 한 명의 시리즈 편 접근 — 요청(또는 배치의 사용자) 단위로 한 번 만든다 */
export interface SeriesEpisodeAccess {
  /** 이 편 번호보다 **큰** 편이 잠긴다. `null`이면 아무것도 잠그지 않는다(스위치 꺼짐 · 최상위 요금제 · 체험 중) */
  readonly lockedAfterEpisodeNo: number | null;
}

/** 잠그지 않는 접근 — 스위치가 꺼져 있거나 열리는 사람이다 */
export const SERIES_ALL_UNLOCKED: SeriesEpisodeAccess = Object.freeze({
  lockedAfterEpisodeNo: null,
});

/** 이 사용자에게 이 편이 잠겼는가. 시리즈가 아닌 콘텐츠·무료 편은 늘 `false`다 */
export function isSeriesEpisodeLocked(
  content: { seriesId: string | null; episodeNo: number | null },
  access: SeriesEpisodeAccess,
): boolean {
  return (
    access.lockedAfterEpisodeNo !== null &&
    content.seriesId !== null &&
    content.episodeNo !== null &&
    content.episodeNo > access.lockedAfterEpisodeNo
  );
}

/** 스위치 해석 — `true`를 명시했을 때만 켜진다(오타·빈 값은 꺼짐) */
export function parseSeriesPaywallEnabled(
  raw: string | undefined | null,
): boolean {
  return raw?.trim() === 'true';
}

/** 무료 편수 해석 — 비었거나 양의 정수가 아니면 기본 3. 형식 검증은 env.validation이 부팅 때 한다 */
export function parseSeriesFreeEpisodes(
  raw: string | undefined | null,
): number {
  const parsed = Number(raw?.trim() ?? '');

  return Number.isInteger(parsed) && parsed >= 1
    ? parsed
    : DEFAULT_SERIES_FREE_EPISODES;
}

/** 판정 입력 — 사용자 한 명의 상태 */
export interface SeriesAccessInput {
  /** 스위치 */
  enabled: boolean;
  freeEpisodes: number;
  /** 저장 티어가 최상위 유료 요금제인가(`PlanService.getPlayLimitPolicy().isTopTier`) */
  isTopTier: boolean;
  /** 가입 체험 중인가(`isSignupTrialActive`) */
  isTrialActive: boolean;
}

/** 사용자 상태 → 접근. 순수 함수 — 서비스·배치·테스트가 같은 규칙을 쓴다 */
export function resolveSeriesEpisodeAccess(
  input: SeriesAccessInput,
): SeriesEpisodeAccess {
  if (!input.enabled || input.isTopTier || input.isTrialActive) {
    return SERIES_ALL_UNLOCKED;
  }

  return { lockedAfterEpisodeNo: input.freeEpisodes };
}

/**
 * 같은 규칙의 SQL판 — 사용자 행을 SQL 안에서 도는 조회(리텐션 알림 "듣던 콘텐츠")가 쓴다. **"이 사용자에게 잠기지 않았다"** 조건식이다.
 *
 * 파라미터 자리: `lockedAfterParam` — 무료 편수(integer, 스위치가 꺼져 있으면 NULL = 아무것도 잠그지 않음) ·
 * `unlockedTiersParam` — 열리는 저장 티어 배열(text[]) · `nowParam` — 체험 판정 시각(timestamptz). 동치는 단위 테스트가 고정한다
 */
export function seriesEpisodeUnlockedSql(columns: {
  seriesId: string;
  episodeNo: string;
  userTier: string;
  userTrialEndsAt: string;
  lockedAfterParam: string;
  unlockedTiersParam: string;
  nowParam: string;
}): string {
  return `(${columns.lockedAfterParam}::int IS NULL OR ${columns.seriesId} IS NULL OR ${columns.episodeNo} IS NULL OR ${columns.episodeNo} <= ${columns.lockedAfterParam}::int OR ${columns.userTier} = ANY(${columns.unlockedTiersParam}::text[]) OR (${columns.userTrialEndsAt} IS NOT NULL AND ${columns.userTrialEndsAt} > ${columns.nowParam}::timestamptz))`;
}
