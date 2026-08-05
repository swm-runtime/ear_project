import 'reflect-metadata';
import 'dotenv/config';

/**
 * Jest는 `NODE_ENV`를 `test`로 고정하고, `dotenv`는 이미 설정된 값을 덮지 않는다.
 * 그대로 두면 `SocialProviderRegistry`가 **실제 제공자 API를 호출하는 클라이언트**를 물어
 * 소셜 로그인 E2E가 카카오·구글·네이버 서버에 붙으려 한다.
 *
 * 제공자 SDK를 아직 붙이지 않았고 개발 대역(`DevClient`)이 `development`에서만 등록되므로,
 * E2E는 그 대역 위에서 돈다. **실제 OAuth 연동을 검증하는 테스트가 아니다** — 검증 대상은
 * "제공자가 신원을 확인해 준 뒤"의 가입·온보딩 흐름이다.
 *
 * 제공자 SDK를 붙이는 시점에 이 파일을 지우고, 대역 대신 테스트용 제공자 스텁을 세운다.
 */
process.env.NODE_ENV = 'development';
