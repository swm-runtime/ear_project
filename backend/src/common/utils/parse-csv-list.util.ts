/** 쉼표로 구분된 환경 변수 값을 문자열 목록으로 바꾼다. */
export function parseCsvList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
