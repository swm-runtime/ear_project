/**
 * 관심 주제 요약의 대표 주제 개수. **프로필과 같은 값이다**(`settings-api.md` 4.1 —
 * "`profile-api.md` 4.1과 동일한 모양·동일한 규칙").
 *
 * 두 화면이 각자 상수를 들고 있는 이유는 **상한이 화면의 규칙**이기 때문이다. 조립 함수
 * (`UserInterestService.buildSummary`)는 상한을 인자로 받고 스스로 정하지 않는다 —
 * 한쪽 화면이 4개를 보여주기로 해도 다른 화면이 따라 바뀌지 않아야 한다.
 */
export const TOP_TOPIC_LIMIT = 3;
