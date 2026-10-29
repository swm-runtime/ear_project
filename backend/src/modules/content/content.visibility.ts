import { ContentLengthProfile, ContentStatus } from './content.enum';
import { Content } from './entities/content.entity';
import { UserMarket } from '@/modules/user/user.enum';

/**
 * 콘텐츠 **노출 조건** — `published`이면서 라이선스가 살아 있는 것(domain.md 5.1 — "두 조건을 한 곳에서만
 * 조립한다"). 탐색·검색·드립 후보(`ContentRepository.applyVisibility`), 재생·상세·담기
 * (`ContentService.getPublishedById`), 라이브러리 목록·복원(`LibraryItemRepository`)이 전부 이 하나를 쓴다.
 *
 * 만료 배치(`ContentExpiryScheduler`, 04:10)는 하루 1회라 만료 시각~배치 사이가 생기는데, 그 창을 어느
 * 노출면은 닫고 어느 노출면은 열어 두면 "탭하면 제공 종료인데 목록에는 보이는" 항목이 남는다.
 *
 * SQL 조각은 콘텐츠 alias가 `content`인 조회에서 쓴다. 파라미터는 `contentVisibilityParameters`로 채운다.
 */
export const CONTENT_VISIBILITY_CONDITION =
  '(content.status = :publishedStatus AND (content.license_expires_at IS NULL OR content.license_expires_at > :now))';

export function contentVisibilityParameters(now: Date): {
  publishedStatus: ContentStatus;
  now: Date;
} {
  return { publishedStatus: ContentStatus.PUBLISHED, now };
}

/**
 * 시장 격리(`global-api.md` 4.7·7장) — 노출 조건에 **항상 함께** 붙는다. 사용자 시장이 아닌 콘텐츠는 어떤 응답에도
 * 나오지 않는다. 데이터가 전부 `kr`인 동안은 결과를 바꾸지 않는다(KR 불변).
 */
export const CONTENT_MARKET_CONDITION = 'content.market = :market';

export function contentMarketParameters(market: UserMarket): {
  market: UserMarket;
} {
  return { market };
}

/** 노출 + 시장 — 콘텐츠 alias `content`인 조회가 한 번에 붙이는 조건 */
export const CONTENT_SCOPE_CONDITION = `(${CONTENT_VISIBILITY_CONDITION} AND ${CONTENT_MARKET_CONDITION})`;

export function contentScopeParameters(
  now: Date,
  market: UserMarket,
): { publishedStatus: ContentStatus; now: Date; market: UserMarket } {
  return {
    ...contentVisibilityParameters(now),
    ...contentMarketParameters(market),
  };
}

/**
 * 짧은 판 코호트(KAN-298) — **노출면(발견 경로)에만** 붙는 세 번째 조건. 사용자 코호트(`ContentCohortService`)와 같은 길이
 * 프로필의 콘텐츠만 남긴다. `null`이면 걸지 않는다 — 라이브러리·공유 링크 상세·재생처럼 **이미 손에 든 콘텐츠**는 막지 않는다
 * (노출 실험이지 접근 제한이 아니다). 시리즈 편은 시리즈와 같은 프로필이라(업로드가 맞춘다) 편 조건 하나로 시리즈 노출도 갈린다
 */
export const CONTENT_LENGTH_PROFILE_CONDITION =
  'content.length_profile = :lengthProfile';

/** 노출 + 시장 + (주면) 길이 프로필 — 노출면 조회가 쓰는 조건과 파라미터를 한 번에 만든다 */
export function contentExposureScope(
  now: Date,
  market: UserMarket,
  lengthProfile: ContentLengthProfile | null,
): { condition: string; parameters: Record<string, unknown> } {
  const scope = contentScopeParameters(now, market);
  if (lengthProfile === null) {
    return { condition: CONTENT_SCOPE_CONDITION, parameters: scope };
  }
  return {
    condition: `(${CONTENT_SCOPE_CONDITION} AND ${CONTENT_LENGTH_PROFILE_CONDITION})`,
    parameters: { ...scope, lengthProfile },
  };
}

/** 위 SQL 조건의 애플리케이션 판정판 — 단건을 이미 읽어 둔 곳에서 쓴다 */
export function isContentVisibleAt(
  content: Pick<Content, 'status' | 'licenseExpiresAt'>,
  now: Date,
): boolean {
  // 엔티티는 null이지만 부분 로드 객체·테스트 픽스처는 undefined일 수 있다 — 둘 다 "만료일 없음"이다
  const licenseExpiresAt = content.licenseExpiresAt ?? null;
  const isLicenseExpired =
    licenseExpiresAt !== null && licenseExpiresAt.getTime() <= now.getTime();

  return content.status === ContentStatus.PUBLISHED && !isLicenseExpired;
}
