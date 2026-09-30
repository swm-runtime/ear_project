/** 팝업이 묻는 편성분 수 — 어제 정규 드립 편수와 같다(`drip-feedback.md` 4.1). 탐험 편은 묻지 않는다 */
export const DRIP_FEEDBACK_PROMPT_LIMIT = 2;

/** 별점 접수 기간(일) — 편성 뒤 이 기간이 지나면 받지 않는다. 팝업은 어제치만 묻지만 뒤늦은 전송(오프라인 큐)을 허용한다 */
export const DRIP_FEEDBACK_RATEABLE_DAYS = 7;

export const DRIP_FEEDBACK_MIN_STARS = 1;
export const DRIP_FEEDBACK_MAX_STARS = 5;
