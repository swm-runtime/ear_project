/** 팝업이 묻는 편성분 수 — 정규 드립 편수와 같다(`drip-feedback.md` 4.1). 탐험 편은 묻지 않는다 */
export const DRIP_FEEDBACK_PROMPT_LIMIT = 2;

/**
 * 별점 접수 기간(일) — 편성 뒤 이 기간이 지나면 받지 않고, 팝업도 묻지 않는다. 팝업은 가장 최근 편성분만
 * 묻지만 뒤늦은 전송(오프라인 큐)을 받으려고 기간을 둔다
 */
export const DRIP_FEEDBACK_RATEABLE_DAYS = 7;

/**
 * 한 사람에게 묻는 간격(일) — **7일에 한 번**(2026-10-16 결정). 매일 새 편성이 생겨 종전엔 매일 물었다. 비교 기준은
 * 지난번에 물은 편성분 날짜(`drip_feedback_last_prompted_date`)다 — 그 날짜 + 7일 전의 편성분은 묻지 않는다.
 * 팝업을 띄운 날이 아니라 편성분 날짜가 기준이라, 오래 쉬다 돌아와 며칠 전 편성분을 물은 뒤에는 다음 팝업까지가
 * 7일보다 짧을 수 있다(예: 6일 전 편성분을 묻고 이틀 뒤 새 편성분을 묻는다). 띄운 날을 남기려면 컬럼이 필요해 두지 않았다.
 * 무작위 표본·닫은 뒤 추가 휴식은 두지 않는다 — 사용자가 적어 표본을 더 줄일 이유가 없다.
 */
export const DRIP_FEEDBACK_PROMPT_INTERVAL_DAYS = 7;

/**
 * 가입 뒤 처음 묻기까지 기다리는 날(서비스 날짜 기준) — 가입일이 1일째이고 **4일째부터** 묻는다(2026-10-16 결정).
 * 첫 드립 하루이틀로는 추천을 평가할 만큼 쓰지 않았다.
 */
export const DRIP_FEEDBACK_SIGNUP_GRACE_DAYS = 3;

export const DRIP_FEEDBACK_MIN_STARS = 1;
export const DRIP_FEEDBACK_MAX_STARS = 5;
