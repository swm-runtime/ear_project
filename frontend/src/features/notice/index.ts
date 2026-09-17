/**
 * notice feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * settings는 이 feature를 import하지 않는다 — 라우트 이름('Notice'·'NoticeDetail')으로
 * 이동만 하고 화면 등록은 app/navigation이 담당한다(content-detail과 같은 방식, 역방향 의존 없음).
 */
export { default as NoticeListScreen } from './screens/NoticeListScreen';
export { default as NoticeDetailScreen } from './screens/NoticeDetailScreen';
