/**
 * content-detail feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 세 진입점(라이브러리·탐색·플레이어)은 이 feature를 import하지 않는다 — 라우트 이름
 * ('ContentDetail')으로 내비게이션만 한다. 화면 등록은 app/navigation이 담당한다.
 */
export { default as ContentDetailScreen } from './screens/ContentDetailScreen';
/** 라우트 파라미터 타입(app/navigation/types.ts의 MainStackParamList가 쓴다) */
export type { ContentDetailEntryPoint } from './content-detail.types';
