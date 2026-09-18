import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MAX_SCRIPT_FILE_BYTES } from './admin.constant';
import { UploadedFileInput } from './admin.types';
import { parseScriptFile } from './script-file';

const tempDir = mkdtempSync(join(tmpdir(), 'ear-script-spec-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function buildScriptFile(value: unknown, size?: number): UploadedFileInput {
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  const path = join(tempDir, `script-${randomUUID()}.json`);
  writeFileSync(path, content, 'utf8');
  return {
    path,
    originalName: 'script-segments.json',
    mimeType: 'application/json',
    size: size ?? Buffer.byteLength(content, 'utf8'),
  };
}

const VALID = [
  { start_sec: 0, end_sec: 12.4, speaker: '윤아', text: '첫 번째 턴' },
  { start_sec: 12.4, end_sec: 27.9, speaker: '이음', text: '두 번째 턴' },
  { start_sec: 27.95, end_sec: 40, speaker: null, text: '세 번째 턴' },
];

describe('parseScriptFile — 대본 세그먼트 파일 검증(admin-api.md 4.6)', () => {
  it('형식이 맞는 세그먼트 배열은 그대로 받아들이고 speaker 생략은 null 로 채운다', async () => {
    const result = await parseScriptFile(
      buildScriptFile([
        ...VALID,
        { start_sec: 40, end_sec: 50, text: '화자 없는 턴' },
      ]),
    );

    expect(result.rejectedReason).toBeNull();
    expect(result.data).toHaveLength(4);
    expect(result.data?.[3]).toEqual({
      start_sec: 40,
      end_sec: 50,
      speaker: null,
      text: '화자 없는 턴',
    });
  });

  it('start_sec 오름차순이 아니면 거부한다', async () => {
    const result = await parseScriptFile(buildScriptFile([VALID[1], VALID[0]]));

    expect(result.data).toBeNull();
    expect(result.rejectedReason).toContain('오름차순');
  });

  it('앞 턴과 겹치면 거부하지만 수십 ms 의 부동소수 오차는 겹침으로 보지 않는다', async () => {
    const overlapping = await parseScriptFile(
      buildScriptFile([
        { start_sec: 0, end_sec: 12.4, speaker: '윤아', text: 'a' },
        { start_sec: 11, end_sec: 20, speaker: '이음', text: 'b' },
      ]),
    );
    const tolerated = await parseScriptFile(
      buildScriptFile([
        { start_sec: 0, end_sec: 12.4, speaker: '윤아', text: 'a' },
        { start_sec: 12.38, end_sec: 20, speaker: '이음', text: 'b' },
      ]),
    );

    expect(overlapping.rejectedReason).toContain('겹쳐요');
    expect(tolerated.rejectedReason).toBeNull();
  });

  it('end_sec 이 start_sec 보다 크지 않거나 text 가 비면 거부한다', async () => {
    const badEnd = await parseScriptFile(
      buildScriptFile([{ start_sec: 5, end_sec: 5, speaker: null, text: 'a' }]),
    );
    const emptyText = await parseScriptFile(
      buildScriptFile([
        { start_sec: 0, end_sec: 5, speaker: null, text: '  ' },
      ]),
    );

    expect(badEnd.rejectedReason).toContain('end_sec');
    expect(emptyText.rejectedReason).toContain('text');
  });

  it('모르는 키·배열 아님·빈 배열·깨진 JSON·상한 초과는 전부 거부한다', async () => {
    expect(
      (
        await parseScriptFile(
          buildScriptFile([{ ...VALID[0], speaker_name: '윤아' }]),
        )
      ).rejectedReason,
    ).toContain('모르는 키');
    expect(
      (await parseScriptFile(buildScriptFile({ segments: VALID })))
        .rejectedReason,
    ).toContain('배열');
    expect(
      (await parseScriptFile(buildScriptFile([]))).rejectedReason,
    ).toContain('하나도');
    expect(
      (await parseScriptFile(buildScriptFile('{not json'))).rejectedReason,
    ).toContain('JSON');
    expect(
      (await parseScriptFile(buildScriptFile(VALID, MAX_SCRIPT_FILE_BYTES + 1)))
        .rejectedReason,
    ).toContain('너무 커요');
  });
});
