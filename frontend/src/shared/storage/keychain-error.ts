/**
 * iOS 키체인이 **기기 잠금 때문에** 거절했는가(`errSecInteractionNotAllowed`, OSStatus -25308).
 *
 * expo-secure-store 는 이 상태를 `KeyChainException: User interaction is not allowed.` 로 던지고, JS 에는
 * `FunctionCallException` 로 한 번 감싸여 메시지에 원인 문장이 실려 온다. 잠금은 **일시적**이다 — 잠금이 풀리면
 * 같은 호출이 성공한다. 그래서 이 판정에 걸린 실패는 "값이 없다"·"세션이 끝났다"로 읽지 않는다(architecture.md 7.2).
 *
 * `KeyChainException` 이라는 이름만으로는 판정하지 않는다 — 다른 OSStatus(손상·권한 등)는 기다려도 풀리지 않는다.
 */
const LOCKED_PATTERNS = ['user interaction is not allowed', 'errsecinteractionnotallowed', '-25308'];

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    return typeof message === 'string' ? message : '';
  }
  return '';
};

const causeOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'cause' in error
    ? (error as { cause: unknown }).cause
    : undefined;

export const isKeychainLockedError = (error: unknown): boolean => {
  // 원인 사슬을 몇 단계만 따라간다 — 감싼 쪽 메시지에 원인 문장이 빠진 경우 대비
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current !== undefined && current !== null; depth += 1) {
    const message = messageOf(current).toLowerCase();
    if (LOCKED_PATTERNS.some((pattern) => message.includes(pattern))) return true;
    current = causeOf(current);
  }
  return false;
};
