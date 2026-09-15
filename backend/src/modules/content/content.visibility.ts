import { ContentStatus } from './content.enum';
import { Content } from './entities/content.entity';

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
