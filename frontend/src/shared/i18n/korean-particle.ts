/**
 * 한국어 조사 — 앞말의 받침에 따라 꼴이 갈리는 조사를 고른다(KAN-239 검색 안내 "‘커리어’로 대신 검색했어요" ·
 * "‘커리오’와 관련된 결과예요"). 서버가 주는 검색어는 무엇이든 올 수 있어 카피에 조사를 박아 두면 "‘면접’로"가 된다.
 *
 * 받침 판정은 마지막 글자가 완성형 한글일 때만이다. 영문·숫자·기호로 끝나면 읽는 소리를 알 수 없어 받침 없는 꼴
 * (로·와)로 둔다 — "‘AI’로"·"‘2026’와"는 어색할 수 있지만 틀린 쪽("‘AI’으로")보다는 낫다.
 */

const HANGUL_SYLLABLE_FIRST = 0xac00;
const HANGUL_SYLLABLE_LAST = 0xd7a3;
const JONGSEONG_COUNT = 28;
/** 종성 ㄹ — "로"는 받침 없음과 ㄹ 받침 뒤에, "으로"는 그 밖의 받침 뒤에 온다 */
const JONGSEONG_RIEUL = 8;

/** 마지막 글자의 종성 번호(0 = 받침 없음). 완성형 한글이 아니면 null */
const finalJongseongOf = (word: string): number | null => {
  const last = word.trimEnd().at(-1);
  const code = last?.codePointAt(0);
  if (code === undefined || code < HANGUL_SYLLABLE_FIRST || code > HANGUL_SYLLABLE_LAST)
    return null;
  return (code - HANGUL_SYLLABLE_FIRST) % JONGSEONG_COUNT;
};

/** 로/으로 — 받침 없음·ㄹ 받침은 "로", 그 밖의 받침은 "으로" */
export const particleRo = (word: string): '로' | '으로' => {
  const jong = finalJongseongOf(word);
  return jong === null || jong === 0 || jong === JONGSEONG_RIEUL ? '로' : '으로';
};

/** 와/과 — 받침 없음은 "와", 받침 있음은 "과" */
export const particleWa = (word: string): '와' | '과' => {
  const jong = finalJongseongOf(word);
  return jong === null || jong === 0 ? '와' : '과';
};
