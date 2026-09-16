import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `users.profile_image_url` (domain.md 3.1, 2026-09-16).
 *
 * 프로필 헤더의 아바타를 제공자 프로필 사진으로 그린다. `profile.md`의 "프로필 이미지 —
 * 도입하지 않는다" 결정을 뒤집었다 — 이미지 파일을 받아 저장하는 것이 아니라 제공자 CDN
 * 주소만 보관하므로 스토리지·중재 비용이 들지 않는다. 로그인마다 제공자 값으로 덮어쓰며,
 * 기존 행은 NULL — 다음 로그인에서 채워진다. 애플은 사진을 주지 않아 항상 NULL이다.
 */
export class AddUsersProfileImageUrl1787400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "profile_image_url" character varying(2048)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "profile_image_url"`,
    );
  }
}
