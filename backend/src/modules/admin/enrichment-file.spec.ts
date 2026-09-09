import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EMBEDDING_DIM } from '@/modules/content/content.constant';

import { parseEnrichmentFile } from './enrichment-file';
import { UploadedFileInput } from './admin.types';

const tempDir = mkdtempSync(join(tmpdir(), 'ear-enrichment-spec-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

/** 파서가 경로에서 읽으므로 임시 파일로 만든다 */
function buildJsonFile(value: unknown): UploadedFileInput {
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  const path = join(tempDir, `enrichment-${randomUUID()}.json`);
  writeFileSync(path, content, 'utf8');
  return {
    path,
    originalName: 'enrichment.json',
    mimeType: 'application/json',
    size: Buffer.byteLength(content, 'utf8'),
  };
}

const VALID_EMBEDDING = {
  model: 'text-embedding-3-small',
  dim: EMBEDDING_DIM,
  vector: new Array<number>(EMBEDDING_DIM).fill(0.1),
};

describe('parseEnrichmentFile', () => {
  it('메타 4종과 임베딩이 전부 유효하면 저장 입력으로 변환된다', async () => {
    const result = await parseEnrichmentFile(
      buildJsonFile({
        difficulty: 'beginner',
        format: 'overview',
        is_evergreen: true,
        keywords: ['ISA 계좌', '비과세 한도'],
        embedding: VALID_EMBEDDING,
      }),
    );

    expect(result.rejectedReason).toBeNull();
    expect(result.data).toEqual({
      difficulty: 'beginner',
      format: 'overview',
      isEvergreen: true,
      keywords: ['ISA 계좌', '비과세 한도'],
      embedding: {
        model: 'text-embedding-3-small',
        vector: VALID_EMBEDDING.vector,
      },
    });
  });

  it('생략된 키는 결손으로 통과한다 — 있는 항목만 저장 입력에 담긴다', async () => {
    const result = await parseEnrichmentFile(
      buildJsonFile({ keywords: ['이직 준비'] }),
    );

    expect(result.data).toEqual({ keywords: ['이직 준비'] });
  });

  it('폴백 표식(source)은 허용하되 저장 입력에는 담지 않는다', async () => {
    const result = await parseEnrichmentFile(
      buildJsonFile({ keywords: ['연봉 협상'], source: 'title_description' }),
    );

    expect(result.data).toEqual({ keywords: ['연봉 협상'] });
  });

  it('알 수 없는 최상위 키가 있으면 거부한다 — 오타가 결손으로 둔갑하지 않는다', async () => {
    const result = await parseEnrichmentFile(
      buildJsonFile({ difficultly: 'beginner' }),
    );

    expect(result.data).toBeNull();
    expect(result.rejectedReason).toContain('difficultly');
  });

  it('enum에 없는 값이면 거부한다', async () => {
    const result = await parseEnrichmentFile(
      buildJsonFile({ difficulty: 'expert' }),
    );

    expect(result.data).toBeNull();
    expect(result.rejectedReason).toContain('difficulty');
  });

  it('벡터 차원이 1536이 아니면 거부한다', async () => {
    const result = await parseEnrichmentFile(
      buildJsonFile({
        embedding: { model: 'text-embedding-3-small', vector: [0.1, 0.2] },
      }),
    );

    expect(result.data).toBeNull();
    expect(result.rejectedReason).toContain('vector');
  });

  it('임베딩 모델이 현재 모델과 다르면 거부한다 — 혼용 벡터는 스코어링이 읽지 않는다', async () => {
    const result = await parseEnrichmentFile(
      buildJsonFile({
        embedding: { ...VALID_EMBEDDING, model: 'dev-stub' },
      }),
    );

    expect(result.data).toBeNull();
    expect(result.rejectedReason).toContain('model');
  });

  it('JSON이 아니면 거부한다', async () => {
    const result = await parseEnrichmentFile(buildJsonFile('not-json{'));

    expect(result.data).toBeNull();
  });

  it('전 키가 생략된 빈 객체는 거부한다 — 저장할 것이 없다', async () => {
    const result = await parseEnrichmentFile(buildJsonFile({}));

    expect(result.data).toBeNull();
  });
});
