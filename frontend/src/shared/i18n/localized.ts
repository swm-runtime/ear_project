import { APP_LANGUAGE, type AppLanguage } from './locale';

/**
 * 한국어 카피와 **같은 모양**의 다른 언어 카피 — 문자열 리터럴은 `string` 으로, 함수는 같은 인자에 `string` 을 돌려주게 넓힌다.
 * 키가 빠지거나 함수 인자가 다르면 타입 오류가 난다(번역 누락이 빌드에서 걸린다).
 */
export type LocalizedCopy<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => LocalizedCopy<R>
    : T extends readonly (infer U)[]
      ? readonly LocalizedCopy<U>[]
      : T extends object
        ? { readonly [K in keyof T]: LocalizedCopy<T[K]> }
        : T;

/**
 * 표시 언어의 카피를 고른다(KAN-194). 각 `*.copy.ts` 는 종전 한국어 객체를 `ko` 로 두고 같은 모양의 `en` 을 더해
 * `export const X_COPY = localized({ ko, en })` 로 내보낸다 — **내보내는 이름·모양이 그대로라 화면 코드는 바뀌지 않고,
 * 한국어 기기에서는 종전 문구와 1:1 같다**(`ko` 객체 자체가 반환된다).
 *
 * 함수형 카피(`(price) => \`${price}/월\``)는 ICU 메시지 대신 언어별 함수로 둔다 — 타입이 인자를 강제하고 조사·복수형 같은
 * 언어 규칙을 그 언어 함수 안에서 처리한다.
 */
export const localized = <T>(
  copy: { ko: T; en: LocalizedCopy<T> },
  language: AppLanguage = APP_LANGUAGE,
): T => (language === 'en' ? (copy.en as unknown as T) : copy.ko);
