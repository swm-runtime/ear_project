import { countryOfTimezone } from './timezone-country';

describe('countryOfTimezone', () => {
  it('시간대를 나라 코드로 바꾸고, 한 나라의 여러 시간대는 같은 코드다', () => {
    expect(countryOfTimezone('Asia/Manila')).toBe('PH');
    expect(countryOfTimezone('Asia/Seoul')).toBe('KR');
    expect(countryOfTimezone('Asia/Kuala_Lumpur')).toBe('MY');
    expect(countryOfTimezone('Asia/Kuching')).toBe('MY');
    expect(countryOfTimezone('America/Los_Angeles')).toBe('US');
  });

  it('시간대가 없으면 unknown, 표에 없는 시간대는 이름 그대로다', () => {
    expect(countryOfTimezone(null)).toBe('unknown');
    expect(countryOfTimezone('')).toBe('unknown');
    expect(countryOfTimezone('unknown')).toBe('unknown');
    expect(countryOfTimezone('Africa/Lagos')).toBe('Africa/Lagos');
  });
});
