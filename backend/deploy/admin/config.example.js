// deploy/admin/config.js 로 복사해 값을 채운다. config.js는 커밋하지 않는다(.gitignore).
//
// googleClientId: Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID
//   (유형: 웹 애플리케이션). "승인된 JavaScript 원본"에 https://admin.<도메인> 을 넣는다.
//   서버 쪽 GoogleClient는 access token으로 userinfo를 조회하므로 리디렉션 URI는 필요 없다.
window.EAR_ADMIN_CONFIG = {
  apiBaseUrl: 'https://api.example.com/api/v1',
  googleClientId: 'xxxxxxxx.apps.googleusercontent.com',
};
