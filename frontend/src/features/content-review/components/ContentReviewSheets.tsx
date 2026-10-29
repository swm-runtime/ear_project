import ContentReviewSheet from './ContentReviewSheet';
import ReviewIssuedSheet from './ReviewIssuedSheet';
import type { ContentReviewLauncher } from '../hooks/useContentReviewLauncher';

interface ContentReviewSheetsProps {
  launcher: ContentReviewLauncher;
}

/**
 * 상시 진입점의 후기 시트(L17)와 발급 안내(L19) — 진입점 화면이 자기 트리 안에 둔다(`useContentReviewLauncher`).
 * 둘은 동시에 열리지 않는다: 발급 안내는 후기 시트가 내려간 뒤에 열린다.
 */
export default function ContentReviewSheets({ launcher }: ContentReviewSheetsProps) {
  return (
    <>
      <ContentReviewSheet variant="review" {...launcher.sheetProps} />
      <ReviewIssuedSheet {...launcher.issuedSheetProps} />
    </>
  );
}
