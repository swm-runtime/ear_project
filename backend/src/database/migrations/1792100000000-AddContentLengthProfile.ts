import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 짧은 판 코호트(KAN-298 — 단기 실험 ④, 2026-10-29) — `contents`·`series`에 길이 프로필과 원본 연결.
 *
 * - `length_profile` — `standard` | `short`, 기본 `standard`. 기존 행은 전부 `standard`라 노출이 바뀌지 않는다(코호트 스위치
 *   `SHORT_CONTENT_COHORT_SINCE`가 비어 있으면 전원 `standard` 코호트다). 상수 기본값의 NOT NULL 열 추가라 PG 11+는 표를 다시
 *   쓰지 않는다.
 * - `variant_of_content_id` / `variant_of_series_id` — 짧은 판의 원본. 같은 표를 가리키는 FK, `ON DELETE RESTRICT`(콘텐츠·시리즈
 *   삭제 API가 없다 — 회수는 상태 전환이다). 원본이 `standard`인지는 업로드가 본다(행 사이 조건이라 CHECK로 못 건다).
 * - CHECK — 값 집합, **`standard`는 원본을 가질 수 없다**, 자기 자신을 가리키지 않는다. "short 단편은 원본 필수"는 짧은 시리즈의
 *   편(원본 화가 없을 수 있다)과 갈려 업로드 검증이 맡는다.
 * - 인덱스는 두지 않는다 — 노출 필터는 기존 `(market, status, published_at)` 위에서 행을 거르는 값 2개짜리 조건이고, 원본으로
 *   변형을 찾는 질의는 아직 없다(지표 비교는 팀이 직접 조회 — 티켓 범위 밖).
 * - 되돌리기는 열 삭제다(제약·FK가 함께 사라진다).
 */
export class AddContentLengthProfile1792100000000 implements MigrationInterface {
  name = 'AddContentLengthProfile1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "length_profile" character varying(16) NOT NULL DEFAULT 'standard'`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "variant_of_content_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD CONSTRAINT "ck_contents_length_profile" CHECK ("length_profile" IN ('standard', 'short'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD CONSTRAINT "ck_contents_variant_of_content" CHECK ("variant_of_content_id" IS NULL OR ("length_profile" = 'short' AND "variant_of_content_id" <> "id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" ADD CONSTRAINT "fk_contents_variant_of_content" FOREIGN KEY ("variant_of_content_id") REFERENCES "contents"("id") ON DELETE RESTRICT`,
    );

    await queryRunner.query(
      `ALTER TABLE "series" ADD "length_profile" character varying(16) NOT NULL DEFAULT 'standard'`,
    );
    await queryRunner.query(
      `ALTER TABLE "series" ADD "variant_of_series_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "series" ADD CONSTRAINT "ck_series_length_profile" CHECK ("length_profile" IN ('standard', 'short'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "series" ADD CONSTRAINT "ck_series_variant_of_series" CHECK ("variant_of_series_id" IS NULL OR ("length_profile" = 'short' AND "variant_of_series_id" <> "id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "series" ADD CONSTRAINT "fk_series_variant_of_series" FOREIGN KEY ("variant_of_series_id") REFERENCES "series"("id") ON DELETE RESTRICT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "series" DROP CONSTRAINT "fk_series_variant_of_series"`,
    );
    await queryRunner.query(
      `ALTER TABLE "series" DROP CONSTRAINT "ck_series_variant_of_series"`,
    );
    await queryRunner.query(
      `ALTER TABLE "series" DROP CONSTRAINT "ck_series_length_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "series" DROP COLUMN "variant_of_series_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "series" DROP COLUMN "length_profile"`,
    );

    await queryRunner.query(
      `ALTER TABLE "contents" DROP CONSTRAINT "fk_contents_variant_of_content"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" DROP CONSTRAINT "ck_contents_variant_of_content"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" DROP CONSTRAINT "ck_contents_length_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" DROP COLUMN "variant_of_content_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contents" DROP COLUMN "length_profile"`,
    );
  }
}
