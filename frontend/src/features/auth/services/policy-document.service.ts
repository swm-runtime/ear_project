import * as WebBrowser from 'expo-web-browser';

import { legalUrlsFor } from '@/shared/lib/legal-urls';
import { logger } from '@/shared/lib/logger';

import { POLICY_DOCUMENT_KEY, type PolicyDocument } from '../auth.constants';
import type { Market } from '../auth.types';

/**
 * 약관 본문 열기 — 인앱 브라우저(`expo-web-browser`)로 띄운다.
 *
 * **열람은 동의가 아니다**(auth-uiux.md 4.1·4.3) — 이 함수는 체크 상태를 건드리지 않는다.
 * 외부 브라우저(`Linking.openURL`)가 아니라 인앱 브라우저인 이유: 앱을 떠나면 동의 화면의
 * 체크 상태를 잃을 수 있고(콜드 스타트), 가입 흐름 중간에 앱 전환이 생긴다.
 *
 * 모듈을 **정적으로** 들여온다 — 동적 `import()`를 쓰면 await 경계에서 사용자 제스처가
 * 끊겨 웹(데모)에서 새 탭이 팝업 차단에 조용히 막힌다. 열람 실패로 가입을 막지는 않는다.
 *
 * **문서는 시장의 것이다**(KAN-216) — GLOBAL 은 영어 본문, KR 은 한국어 본문. 표시 언어로 고르지 않는다(`legal-urls.ts`).
 */
export async function openPolicyDocument(document: PolicyDocument, market: Market): Promise<void> {
  const url = legalUrlsFor(market)[POLICY_DOCUMENT_KEY[document]];
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch (error) {
    logger.warn('[auth] open policy document failed', document, error);
  }
}
