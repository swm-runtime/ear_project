import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ERROR_CODES } from './error-codes';
import { ERROR_MESSAGES_EN, errorMessageEn, FALLBACK_ERROR_MESSAGE_EN } from './error-messages';

/**
 * 영어 에러 문구 누락 검사(KAN-194 완료 조건 "en 문자열 누락 0건, 누락을 넣으면 테스트가 실패한다").
 * 원본은 `docs/features/common-error-handling.md` 9장 표다 — 표에 코드가 생기면 이 테스트가 앱에 영어 문구를 요구한다.
 */
const DOC_PATH = join(__dirname, '../../../../docs/features/common-error-handling.md');

const documentedCodes = (): string[] => {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const section = doc.slice(doc.indexOf('## 9.'), doc.indexOf('## 10.'));
  return [...section.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)].map((match) => match[1]);
};

const HANGUL = /[가-힣]/;

describe('ERROR_MESSAGES_EN — 서버 error_code 영어 문구', () => {
  it('9장 표에서 코드를 읽는다(파싱이 깨지면 아래 검사가 빈 목록으로 통과하지 않게)', () => {
    expect(documentedCodes().length).toBeGreaterThan(50);
  });

  it('9장 표의 모든 코드에 영어 문구가 있다', () => {
    const missing = documentedCodes().filter((code) => !(code in ERROR_MESSAGES_EN));
    expect(missing).toEqual([]);
  });

  it('앱이 아는 서버 코드(ERROR_CODES)에도 전부 영어 문구가 있다', () => {
    // 응답을 못 받았을 때 앱이 직접 만드는 코드는 서버 코드가 아니다 — 문구는 api-client 가 언어별로 갖는다
    const CLIENT_ONLY = ['NETWORK_ERROR', 'TIMEOUT', 'UNKNOWN'];
    const missing = Object.values(ERROR_CODES).filter(
      (code) => !(code in ERROR_MESSAGES_EN) && !CLIENT_ONLY.includes(code),
    );
    expect(missing).toEqual([]);
  });

  it('영어 문구에 한글이 없다', () => {
    expect(Object.values(ERROR_MESSAGES_EN).filter((message) => HANGUL.test(message))).toEqual([]);
  });

  it('모르는 코드는 공통 영어 문구로 떨어진다 — 서버 한국어를 보이지 않는다', () => {
    expect(errorMessageEn('SOME_NEW_CODE')).toBe(FALLBACK_ERROR_MESSAGE_EN);
  });
});
