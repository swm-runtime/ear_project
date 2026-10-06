import {
  AAC_AUDIO_CONTENT_TYPES,
  AUDIO_CONTENT_TYPES,
  LOSSLESS_AUDIO_CONTENT_TYPES,
  STORED_AUDIO_CONTENT_TYPES,
} from './admin.constant';

describe('STORED_AUDIO_CONTENT_TYPES', () => {
  it('음질 3종이 받는 확장자는 전부 저장용 Content-Type 이 있다 — 없으면 그 파일이 타입 없이 저장된다', () => {
    const accepted = [
      ...Object.keys(AUDIO_CONTENT_TYPES),
      ...Object.keys(AAC_AUDIO_CONTENT_TYPES),
      ...Object.keys(LOSSLESS_AUDIO_CONTENT_TYPES),
    ];

    for (const extension of accepted) {
      expect(STORED_AUDIO_CONTENT_TYPES[extension]).toMatch(/^audio\//);
    }
  });

  it('무손실(flac)은 audio/flac 으로 저장한다', () => {
    expect(STORED_AUDIO_CONTENT_TYPES.flac).toBe('audio/flac');
  });
});
