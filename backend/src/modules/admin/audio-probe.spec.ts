// `music-metadata`는 ESM 전용이라 jest(CJS)가 실제 모듈을 읽지 못한다 — 여기서는 순수 함수만 보므로 가상 mock 으로 막는다
jest.mock('music-metadata', () => ({ parseFile: jest.fn() }), {
  virtual: true,
});

import { normalizeCodec } from './audio-probe';

describe('normalizeCodec — music-metadata 코덱 표기를 짧은 이름으로', () => {
  it('m4a(MPEG-4/AAC)는 mp3 가 아니라 aac 다 — aac 를 mpeg 보다 먼저 본다(2026-10-06 운영 실측)', () => {
    expect(normalizeCodec('MPEG-4/AAC', 'M4A/mp42/isom')).toBe('aac');
    expect(normalizeCodec('AAC', 'M4A')).toBe('aac');
  });

  it('mp3·flac·pcm 은 각각 제 이름으로, 모르는 값은 원값 소문자', () => {
    expect(normalizeCodec('MPEG 1 Layer 3', 'MPEG')).toBe('mp3');
    expect(normalizeCodec('FLAC', 'FLAC')).toBe('flac');
    expect(normalizeCodec('PCM', 'WAVE')).toBe('pcm');
    expect(normalizeCodec('Opus', 'Ogg')).toBe('opus');
    expect(normalizeCodec(undefined, undefined)).toBe('unknown');
  });
});
