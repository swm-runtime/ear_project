import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `content_audio_renditions.codec` 보정 — m4a(AAC) 파일이 `mp3`로 기록된 행을 `aac`로(KAN-141 댓글, 2026-10-06).
 * `audio-probe.ts`의 `normalizeCodec`가 mpeg 를 aac 보다 먼저 봐서 "MPEG-4/AAC"를 mp3 로 분류했다 — 코드는 같은 PR 에서
 * 고쳤고, 이미 적힌 행(운영 40편의 compressed)은 여기서 바로잡는다. 재생에는 영향이 없는 진단용 값이다.
 * 되돌리기는 하지 않는다 — 틀린 값으로 돌아갈 이유가 없다.
 */
export class FixM4aRenditionCodec1789000000000 implements MigrationInterface {
  name = 'FixM4aRenditionCodec1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "content_audio_renditions"
          SET "codec" = 'aac'
        WHERE "codec" = 'mp3'
          AND lower("path") LIKE '%.m4a'`,
    );
  }

  public async down(): Promise<void> {
    // 보정만 하는 마이그레이션 — 되돌릴 틀린 값이 없다
  }
}
