import ContentReviewSheet from './ContentReviewSheet';
import ReviewIssuedSheet from './ReviewIssuedSheet';
import {
  useContentReviewPromptSheet,
  type ContentReviewPromptSignals,
} from '../hooks/useContentReviewPromptSheet';

/**
 * 먼저 묻는 시트(L18 — library-uiux.md 4.14). 판정 조회는 라이브러리 진입 때 하고(`useContentReviewEntry`), 그리기는
 * MainNavigator 가 한다 — 추천 별점 팝업 · 가입 체험 안내 등 다른 앱 시작 팝업과 순서를 맞춰야 해서다(같은 자리).
 * 플레이어가 떠 있으면 열리지 않는다(`isReady`) — 플레이어 화면 · 완청 순간에는 묻지 않는다(content-review.md 2.1).
 */
export default function ContentReviewPrompt(props: ContentReviewPromptSignals) {
  const prompt = useContentReviewPromptSheet(props);
  return (
    <>
      {/* 띄울 편이 없으면 시트를 그리지 않는다. 닫은 뒤에도 편은 남아 퇴장 모션이 끊기지 않는다 */}
      {prompt.hasContent ? <ContentReviewSheet variant="prompt" {...prompt.sheetProps} /> : null}
      <ReviewIssuedSheet {...prompt.issuedSheetProps} />
    </>
  );
}
