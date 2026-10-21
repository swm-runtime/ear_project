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

/** 한 언어 카피 안의 경로를 따라간다 — 모양이 같으므로 두 언어 모두 같은 경로가 있다 */
const resolvePath = (root: unknown, path: readonly PropertyKey[]): unknown => {
  let node = root;
  for (const key of path) node = (node as Record<PropertyKey, unknown>)[key];
  return node;
};

const isPlainObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/**
 * 읽는 순간의 표시 언어로 풀리는 카피 — 일반 객체만 감싼다(문자열·함수·배열은 읽는 순간 그 언어의 값을 그대로 준다).
 * 같은 경로는 같은 프록시를 돌려준다(`COPY.a === COPY.a` — 메모이제이션 의존성이 흔들리지 않게).
 */
const liveCopy = (copy: { ko: unknown; en: unknown }, path: readonly PropertyKey[]): object => {
  const current = () =>
    resolvePath(APP_LANGUAGE === 'en' ? copy.en : copy.ko, path) as Record<PropertyKey, unknown>;
  const children = new Map<PropertyKey, object>();
  const read = (key: PropertyKey): unknown => {
    const value = current()[key];
    if (!isPlainObject(value)) return value;
    let child = children.get(key);
    if (child === undefined) {
      child = liveCopy(copy, [...path, key]);
      children.set(key, child);
    }
    return child;
  };
  // 대상은 빈 객체 — 프록시 불변식(대상에 없는 속성은 설정 가능으로만 보고)을 지키고 키는 모두 지금 언어 쪽에서 읽는다
  return new Proxy(
    {},
    {
      get: (_target, key) => read(key),
      has: (_target, key) => key in current(),
      ownKeys: () => Reflect.ownKeys(current()),
      getOwnPropertyDescriptor(_target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(current(), key);
        if (descriptor === undefined) return undefined;
        return 'value' in descriptor
          ? { ...descriptor, value: read(key), configurable: true }
          : { ...descriptor, configurable: true };
      },
    },
  );
};

/**
 * 표시 언어의 카피를 고른다(KAN-194). 각 `*.copy.ts` 는 종전 한국어 객체를 `ko` 로 두고 같은 모양의 `en` 을 더해
 * `export const X_COPY = localized({ ko, en })` 로 내보낸다 — **내보내는 이름·모양이 그대로라 화면 코드는 바뀌지 않고,
 * 한국어 기기에서는 종전 문구와 1:1 같다**.
 *
 * 함수형 카피(`(price) => \`${price}/월\``)는 ICU 메시지 대신 언어별 함수로 둔다 — 타입이 인자를 강제하고 조사·복수형 같은
 * 언어 규칙을 그 언어 함수 안에서 처리한다.
 *
 * **언어를 주지 않으면 읽는 순간의 표시 언어로 풀린다**(PM 2026-10-19 — 가입 때 고른 언어로 다시 부르지 않고 화면 언어를
 * 바꾼다, `locale.ts` `adoptSignupLanguage`). 카피 모듈은 앱이 켜질 때 한 번 평가되므로, 그때 한 벌을 골라 굳히면 가입
 * 도중에 바뀐 언어를 A4부터 그리지 못한다. 그래서 객체 카피는 프록시로 돌려주고 `COPY.a.b` 를 읽는 순간 지금 언어의 값을 준다
 * (`const EMAIL_COPY = AUTH_COPY.email` 처럼 하위 객체를 모듈 최상위에 담아 둬도 산다). **문자열·함수를 모듈 최상위에서 꺼내
 * 담으면 그때 언어로 굳는다** — 그리는 순간에 읽는다. 언어를 주면(테스트) 그 언어의 객체 자체를 돌려준다.
 */
export function localized<T>(copy: { ko: T; en: LocalizedCopy<T> }, language?: AppLanguage): T {
  if (language !== undefined) return language === 'en' ? (copy.en as unknown as T) : copy.ko;
  if (isPlainObject(copy.ko)) return liveCopy(copy, []) as T;
  if (typeof copy.ko === 'function') {
    // 함수 카피(인자를 받는 한 문장) — 부르는 순간의 언어 함수를 부른다
    const pick = () =>
      (APP_LANGUAGE === 'en' ? copy.en : copy.ko) as unknown as (...args: unknown[]) => unknown;
    return ((...args: unknown[]) => pick()(...args)) as unknown as T;
  }
  // 문자열·배열 — 감쌀 수 없어 지금 언어로 고른다(모듈 최상위에서 부르면 시작 때 언어로 굳는다)
  return APP_LANGUAGE === 'en' ? (copy.en as unknown as T) : copy.ko;
}
