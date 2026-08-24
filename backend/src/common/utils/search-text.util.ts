/**
 * 검색 질의 정규화 — **NFC 정규화 + 소문자 통일 + 앞뒤 공백 제거** (`explore.md` 4.5-5).
 *
 * NFD 분해형 입력(ㅋ+ㅓ — macOS 계열 입력기)이 NFC로 저장된 텍스트와 매칭되지 않는 것을
 * 막는다. 정규화는 애플리케이션 계층이 하고 정규화 사본 컬럼은 두지 않는다(domain.md 5.1).
 */
export function normalizeSearchText(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase();
}

/**
 * LIKE/ILIKE 패턴 안에 질의를 넣기 전에 와일드카드를 이스케이프한다.
 * 이스케이프하지 않으면 `%`·`_` 입력이 "전체 일치" 패턴이 되어 검색 결과가 오염된다.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** 트림 후 특수문자·이모지만 남는 질의 판정 — 문자·숫자가 하나도 없으면 검색하지 않는다 */
export function hasSearchableCharacter(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}
