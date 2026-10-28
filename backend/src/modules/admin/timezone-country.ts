/**
 * 기기 시간대(IANA, `users.timezone`) → 나라(ISO 3166-1 alpha-2) — 서비스 지표 나라별 표(2026-10-29).
 *
 * 처음에는 `users.region_code`(기기 언어 설정의 지역)로 나눴는데, 필리핀 Android 의 상당수가 기기 언어를 "English (United
 * Kingdom)·(United States)"로 써서 영국 스토어를 열지 않았는데도 영국 14명·미국 20명이 잡혔다(그중 마닐라 시간대가 각각 13·16명).
 * 시간대는 "지금 어디에 있나"에 훨씬 가깝다 — 여행·수동 설정은 감수한다.
 *
 * 표에 없는 시간대는 시간대 이름 그대로 돌려준다(화면이 그대로 보여 준다) — 새 나라가 들어오면 여기 한 줄 추가한다.
 */
const TIMEZONE_COUNTRY: Record<string, string> = {
  // 동아시아
  'Asia/Seoul': 'KR',
  'Asia/Tokyo': 'JP',
  'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Taipei': 'TW',
  'Asia/Macau': 'MO',
  // 동남아시아
  'Asia/Manila': 'PH',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Kuching': 'MY',
  'Asia/Jakarta': 'ID',
  'Asia/Makassar': 'ID',
  'Asia/Jayapura': 'ID',
  'Asia/Pontianak': 'ID',
  'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Saigon': 'VN',
  'Asia/Phnom_Penh': 'KH',
  'Asia/Yangon': 'MM',
  'Asia/Brunei': 'BN',
  // 남·서아시아
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Karachi': 'PK',
  'Asia/Dhaka': 'BD',
  // 오세아니아
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU',
  'Pacific/Auckland': 'NZ',
  // 유럽
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  // 아메리카
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'America/Los_Angeles': 'US',
  'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
  'America/Detroit': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
};

/** 시간대 → 나라 코드. 시간대가 없으면 `unknown`, 표에 없으면 시간대 이름 그대로 */
export function countryOfTimezone(timezone: string | null): string {
  if (!timezone || timezone === 'unknown') return 'unknown';
  return TIMEZONE_COUNTRY[timezone] ?? timezone;
}
