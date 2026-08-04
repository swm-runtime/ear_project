/**
 * UUID v4 형식 식별자 생성. 멱등키·기기 식별자 용도로 충분한 수준의 난수를 쓴다.
 * TODO: expo-crypto 도입 시 crypto 기반 난수로 교체한다.
 */
export const generateId = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
