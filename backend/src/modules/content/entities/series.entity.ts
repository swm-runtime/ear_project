import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { SeriesStatus } from '../content.enum';

/**
 * 시리즈(KAN-134 확정 설계 1번, 2026-10-17) — 처음부터 N편으로 기획한 콘텐츠 묶음의 주인.
 * `contents.series_id`가 이 행을 가리킨다(`fk_contents_series`).
 *
 * **표지는 `cover_url`이 있으면 그것, 없으면 노출 중인 가장 앞 편(보통 1화)의 썸네일이다**
 * (결정 2026-10-09 · 표지 칸 신설 2026-10-21 — KAN-234, `resolveSeriesCover`).
 * **시장 칸도 없다** — 시리즈는 편(contents)의 시장을 따른다. 같은 시리즈에 다른 시장 편을 올리지 못하게 업로드가 막는다.
 *
 * 담기·재생 위치·완청·통계·페이월 차감은 지금처럼 편 단위다 — 그 테이블들은 이 테이블을 참조하지 않는다.
 */
@Entity('series')
export class Series extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  /**
   * 계획 편수 — 총 편수의 기준이다(`contents.total_episodes`는 업로드 계약 호환으로 남고 이 값과 같아야 한다).
   * 상한은 없다. 이미 발행된 가장 큰 편 번호보다 작게 줄일 수 없다
   */
  @Column({ name: 'total_episodes', type: 'int' })
  totalEpisodes: number;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: SeriesStatus;

  /**
   * 시리즈 표지의 공개 URL(KAN-234, 2026-10-21) — `contents.thumbnail_url`과 같은 종류의 값이다(저장 규격 WebP 768px로
   * 다시 써서 `ContentStorageClient.putThumbnail`이 돌려준 URL). 관리자가 `PUT /admin/series/:id/cover`로 올렸을 때만 차고,
   * 비어 있으면 응답의 표지는 종전대로 노출 중인 가장 앞 편의 썸네일이다.
   * 편 썸네일은 2026-10-20부터 같은 그림에 편 번호만 달라 1화 썸네일을 표지로 쓰면 카드에 "01"이 찍힌다
   */
  @Column({ name: 'cover_url', type: 'text', nullable: true })
  coverUrl: string | null;
}
