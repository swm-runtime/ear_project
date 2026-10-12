import { describe, expect, it } from '@jest/globals';

import { EXPLORE_COPY } from './explore.copy';

describe('EXPLORE_COPY.row.metaWithTags — 카드 하단 줄(KAN-163)', () => {
  it('해시태그가 있으면 "#태그 #태그 · N분" — "#"은 화면이 붙인다', () => {
    expect(EXPLORE_COPY.row.metaWithTags(['협상', '앵커링'], 12)).toBe('#협상 #앵커링 · 12분');
  });

  it('해시태그가 없으면 길이만 — 자리를 비우지 않는다', () => {
    expect(EXPLORE_COPY.row.metaWithTags([], 8)).toBe('8분');
  });
});
