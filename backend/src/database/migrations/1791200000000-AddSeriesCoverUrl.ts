import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `series.cover_url` (domain.md 5.9 신설 요청 — `changes/pending/series-cover-image.md`, 2026-10-21 · KAN-234).
 *
 * 2026-10-20부터 시리즈 편 썸네일은 같은 그림에 편 번호(01·02…)만 다르게 만든다. 표지를 "노출 중인 가장 앞 편의
 * 썸네일"로 두면 시리즈 카드·시리즈 화면 머리에 "01"이 찍힌다. 파이프라인이 따로 만든 표지를 올릴 칸이다.
 *
 * - 값은 `contents.thumbnail_url`과 같은 종류다 — 저장소에 올린 뒤 받은 **공개 URL**(키가 아니다). 교체 때 옛 객체는
 *   `ContentStorageClient.resolveKey`로 되짚어 지운다(콘텐츠 썸네일 재발행과 같은 방식).
 * - **NULL 허용, 백필 없음** — 비어 있으면 응답은 종전처럼 가장 앞 편 썸네일을 쓴다(기존 CS·경제·철학 시리즈 그대로).
 * - 기본값 없는 NULL 열 추가라 표를 다시 쓰지 않는다(잠금이 짧다). 되돌리기는 열 삭제 하나다.
 */
export class AddSeriesCoverUrl1791200000000 implements MigrationInterface {
  name = 'AddSeriesCoverUrl1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "series" ADD "cover_url" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "series" DROP COLUMN "cover_url"`);
  }
}
