import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** 고엔트로피 토큰(refresh token)용 해시. 원문을 저장하지 않기 위해 쓴다 (domain.md 3.3) */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 식별자 대체값 생성 — pepper가 없으면 대조로 역추적이 가능해진다 (domain.md 11.2) */
export function hmacSha256Hex(pepper: string, message: string): string {
  return createHmac('sha256', pepper).update(message).digest('hex');
}

/** 길이가 같은 hex 문자열을 상수 시간으로 비교한다 (타이밍 공격 방지 — auth.md 4.5) */
export function equalsInConstantTime(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
