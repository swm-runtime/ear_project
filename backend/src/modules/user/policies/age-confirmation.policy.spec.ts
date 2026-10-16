import { UserMarket } from '../user.enum';
import {
  ageConfirmationVersionFor,
  confirmedMinAgeOf,
  minAgeFor,
} from './age-confirmation.policy';

const globalIn = (regionCode: string | null) => ({
  market: UserMarket.GLOBAL,
  regionCode,
});

describe('minAgeFor — 연령 확인의 기준 연령(KAN-220)', () => {
  it('GLOBAL은 싱가포르·홍콩·한국 지역이면 16이다', () => {
    expect(minAgeFor(globalIn('SG'))).toBe(16);
    expect(minAgeFor(globalIn('HK'))).toBe(16);
    expect(minAgeFor(globalIn('KR'))).toBe(16);
  });

  it('GLOBAL의 말레이시아·필리핀·인도네시아·태국과 그 밖의 지역은 18이다', () => {
    for (const region of ['MY', 'PH', 'ID', 'TH', 'US']) {
      expect(minAgeFor(globalIn(region))).toBe(18);
    }
  });

  it('GLOBAL인데 지역을 모르면 보수값 18이다', () => {
    expect(minAgeFor(globalIn(null))).toBe(18);
  });

  it('지역 코드의 대소문자는 가리지 않는다 — 저장값은 대문자지만 입력 경로가 늘어도 같은 판정이다', () => {
    expect(minAgeFor(globalIn('sg'))).toBe(16);
  });

  it('KR 시장은 지역과 무관하게 18이다 — 싱가포르 기기여도 18', () => {
    expect(minAgeFor({ market: UserMarket.KR, regionCode: 'SG' })).toBe(18);
    expect(minAgeFor({ market: UserMarket.KR, regionCode: null })).toBe(18);
  });
});

describe('ageConfirmationVersionFor — 이력에 남기는 기준 연령', () => {
  it('GLOBAL은 확인받은 기준 연령을 버전으로 남긴다', () => {
    expect(ageConfirmationVersionFor(globalIn('SG'))).toBe('age-16');
    expect(ageConfirmationVersionFor(globalIn('MY'))).toBe('age-18');
  });

  it('KR은 종전처럼 null이다 — 바꾸면 기존 KR 사용자 전원에게 재확인이 뜬다', () => {
    expect(
      ageConfirmationVersionFor({ market: UserMarket.KR, regionCode: 'KR' }),
    ).toBeNull();
  });
});

describe('confirmedMinAgeOf — 이력이 확인해 준 기준 연령', () => {
  it('버전의 숫자를 읽는다', () => {
    expect(confirmedMinAgeOf('age-16')).toBe(16);
    expect(confirmedMinAgeOf('age-18')).toBe(18);
  });

  it('null(KR 문구·도입 전 이력)은 18로 본다', () => {
    expect(confirmedMinAgeOf(null)).toBe(18);
  });

  it('모르는 형식은 0으로 본다 — 확인 기준을 알 수 없으면 다시 묻는다', () => {
    expect(confirmedMinAgeOf('0.1')).toBe(0);
    expect(confirmedMinAgeOf('age-16-v2')).toBe(0);
  });
});
