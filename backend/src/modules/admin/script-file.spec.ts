import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MAX_SCRIPT_FILE_BYTES, MAX_SCRIPT_SECTIONS } from './admin.constant';
import { UploadedFileInput } from './admin.types';
import {
  ScriptParseResult,
  parseScriptFile,
  rejectSectionsPastDuration,
} from './script-file';

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
    expect(result.data?.segments).toHaveLength(4);
    expect(result.data?.segments[3]).toEqual({
      start_sec: 40,
      end_sec: 50,
      speaker: null,
      text: '화자 없는 턴',
    });
    // 배열 형식 = 구간 없음(KAN-144)
    expect(result.data?.sections).toEqual([]);
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
      (await parseScriptFile(buildScriptFile({ turns: VALID }))).rejectedReason,
    ).toContain('모르는 키');
    expect(
      (await parseScriptFile(buildScriptFile('"문자열"'))).rejectedReason,
    ).toContain('최상위');
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

const SECTIONS = [
  { start_sec: 0, title: '인트로' },
  { start_sec: 12.4, title: '도입' },
  { start_sec: 27.95, title: '깬 직후의 멍함은 잠이 모자란 신호가 아니다' },
];

describe('parseScriptFile — 객체 형식과 구간 제목(admin-api.md 4.6 `sections`, KAN-144)', () => {
  it('{ segments, sections } 객체 형식은 세그먼트와 구간을 함께 받아들인다', async () => {
    const result = await parseScriptFile(
      buildScriptFile({ segments: VALID, sections: SECTIONS }),
    );

    expect(result.rejectedReason).toBeNull();
    expect(result.data?.segments).toHaveLength(3);
    expect(result.data?.sections).toEqual(SECTIONS);
  });

  it('sections 를 생략한 객체 형식은 배열 형식과 같다 — 구간 없음', async () => {
    const result = await parseScriptFile(buildScriptFile({ segments: VALID }));

    expect(result.rejectedReason).toBeNull();
    expect(result.data?.sections).toEqual([]);
  });

  it('구간이 어긋나면 세그먼트가 멀쩡해도 파일을 통째로 거부한다 — 같은 값·역순·빈 제목·긴 제목·모르는 키', async () => {
    const cases: [unknown, string][] = [
      [[SECTIONS[0], { start_sec: 0, title: '같은 시각' }], '엄격한 오름차순'],
      [[SECTIONS[1], SECTIONS[0]], '엄격한 오름차순'],
      [[{ start_sec: 0, title: '  ' }], 'title이 비어'],
      [[{ start_sec: 0, title: '가'.repeat(61) }], '너무 길어요'],
      [[{ start_sec: 0, title: '인트로', chapter: 1 }], '모르는 키'],
      [[{ start_sec: -1, title: '인트로' }], 'start_sec'],
      ['구간', 'sections가 구간 배열'],
    ];

    for (const [sections, reason] of cases) {
      const result = await parseScriptFile(
        buildScriptFile({ segments: VALID, sections }),
      );

      expect(result.data).toBeNull();
      expect(result.rejectedReason).toContain(reason);
    }
  });

  it('구간 상한을 넘으면 거부하고, 빈 구간 배열은 받아들인다', async () => {
    const tooMany = Array.from({ length: MAX_SCRIPT_SECTIONS + 1 }, (_, i) => ({
      start_sec: i,
      title: `구간 ${i}`,
    }));

    expect(
      (
        await parseScriptFile(
          buildScriptFile({ segments: VALID, sections: tooMany }),
        )
      ).rejectedReason,
    ).toContain('너무 많아요');
    expect(
      (
        await parseScriptFile(
          buildScriptFile({ segments: VALID, sections: [] }),
        )
      ).data?.sections,
    ).toEqual([]);
  });

  it('최상위에 모르는 키가 있거나 segments 가 배열이 아니면 거부한다', async () => {
    expect(
      (
        await parseScriptFile(
          buildScriptFile({ segments: VALID, sections: SECTIONS, meta: {} }),
        )
      ).rejectedReason,
    ).toContain('최상위에 모르는 키');
    expect(
      (await parseScriptFile(buildScriptFile({ segments: 'x', sections: [] })))
        .rejectedReason,
    ).toContain('segments가 세그먼트 배열');
  });
});

describe('parseScriptFile — 구간의 kind·summary(KAN-151)', () => {
  it('kind 와 summary 는 선택이다 — 있으면 그대로, 없으면 키 자체가 없다', async () => {
    const result = await parseScriptFile(
      buildScriptFile({
        segments: VALID,
        sections: [
          { start_sec: 0, title: '인트로', kind: 'intro' },
          {
            start_sec: 12.4,
            title: '도입',
            kind: 'lead',
            summary: '오늘 다룰 질문 하나',
          },
          { start_sec: 27.95, title: '본문 단락' },
        ],
      }),
    );

    expect(result.rejectedReason).toBeNull();
    expect(result.data?.sections).toEqual([
      { start_sec: 0, title: '인트로', kind: 'intro' },
      {
        start_sec: 12.4,
        title: '도입',
        kind: 'lead',
        summary: '오늘 다룰 질문 하나',
      },
      { start_sec: 27.95, title: '본문 단락' },
    ]);
    expect('kind' in result.data!.sections[2]).toBe(false);
  });

  it('모르는 kind·빈 summary·41자 summary 는 파일을 통째로 거부한다', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [
        { start_sec: 0, title: '인트로', kind: 'chapter' },
        'kind는 intro | lead | body | outro',
      ],
      [{ start_sec: 0, title: '인트로', kind: 1 }, 'kind는'],
      [{ start_sec: 0, title: '인트로', summary: '  ' }, 'summary가 비어'],
      [
        { start_sec: 0, title: '인트로', summary: '가'.repeat(41) },
        'summary가 너무 길어요',
      ],
    ];

    for (const [section, reason] of cases) {
      const result = await parseScriptFile(
        buildScriptFile({ segments: VALID, sections: [section] }),
      );

      expect(result.data).toBeNull();
      expect(result.rejectedReason).toContain(reason);
    }
  });

  it('summary 40자는 받는다', async () => {
    const result = await parseScriptFile(
      buildScriptFile({
        segments: VALID,
        sections: [
          {
            start_sec: 0,
            title: '인트로',
            kind: 'body',
            summary: '가'.repeat(40),
          },
        ],
      }),
    );

    expect(result.rejectedReason).toBeNull();
  });
});

describe('rejectSectionsPastDuration — 마지막 구간은 오디오 길이 안에서 시작해야 한다', () => {
  const accepted: ScriptParseResult = {
    data: { segments: VALID, sections: SECTIONS },
    rejectedReason: null,
  };

  it('마지막 구간이 길이 안이면 그대로, 길이 이상이면 거부로 바꾼다', () => {
    expect(rejectSectionsPastDuration(accepted, 40)).toBe(accepted);

    const rejected = rejectSectionsPastDuration(accepted, 27.95);
    expect(rejected.data).toBeNull();
    expect(rejected.rejectedReason).toContain('오디오 길이');
  });

  it('구간이 없거나 이미 거부된 결과는 건드리지 않는다', () => {
    const noSections: ScriptParseResult = {
      data: { segments: VALID, sections: [] },
      rejectedReason: null,
    };
    const alreadyRejected: ScriptParseResult = {
      data: null,
      rejectedReason: '깨짐',
    };

    expect(rejectSectionsPastDuration(noSections, 1)).toBe(noSections);
    expect(rejectSectionsPastDuration(alreadyRejected, 1)).toBe(
      alreadyRejected,
    );
  });
});
