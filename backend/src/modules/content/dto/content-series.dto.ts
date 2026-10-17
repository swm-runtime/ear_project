import { ContentSeriesRef } from '../content.types';

/**
 * 편이 속한 시리즈(KAN-134 확정 설계 3번) — 탐색 카드·라이브러리 항목·플레이어 발급·상세·시리즈 화면 응답의 `content.series`가
 * **모두 이 모양이다**. 평평한 세 칸 대신 객체 하나로 두어 FE가 어디서든 같은 방식으로 "N부작 중 M화"를 그린다.
 * 단일 콘텐츠는 `null`이다. `total_episodes`는 `series.total_episodes`(시리즈 표)의 값이다.
 */
export class ContentSeriesDto {
  readonly id: string;
  readonly title: string;
  readonly episode_no: number;
  readonly total_episodes: number;

  static from(
    ref: ContentSeriesRef | null | undefined,
  ): ContentSeriesDto | null {
    return ref
      ? {
          id: ref.id,
          title: ref.title,
          episode_no: ref.episodeNo,
          total_episodes: ref.totalEpisodes,
        }
      : null;
  }
}
