/**
 * 강제 정렬 기준 경계 계산 (2026-10-01) — 순수 함수만 둔다(테스트용으로 분리).
 *
 * dialogue 응답(`/text-to-dialogue/with-timestamps`)의 글자 시각은 한 요청 안에서 뒤로 갈수록 실제 오디오보다 앞선다
 * (T260929-003 디버그 실측: 요청 끝에서 1.4~10.3초). 그 시각으로 자른 문맥 겹침 경계·배속 조각·자막·끝 꼬리가 전부 어긋났다.
 * 요청마다 그 오디오를 강제 정렬해 받은 시각만 쓴다 — 강제 정렬의 시각은 오디오에서 잰 값이라 누적 오차가 없다.
 */

/** 정렬이 오디오를 끝까지 덮는지. ElevenLabs 출력은 마지막 음절 직후에 끝나므로 마지막 글자 끝은 오디오 끝 가까이 있어야 한다. 이상이면 사유, 정상이면 null */
export function alignmentGap(lastEndSec: number, audioSec: number, maxShortSec = 2, maxOverSec = 0.3): string | null {
  if (!(lastEndSec > 0)) return "정렬 시각 없음";
  if (audioSec - lastEndSec > maxShortSec) return `정렬이 오디오 끝 ${(audioSec - lastEndSec).toFixed(1)}초 앞에서 끝남`;
  if (lastEndSec - audioSec > maxOverSec) return `정렬이 오디오 길이를 ${(lastEndSec - audioSec).toFixed(1)}초 넘음`;
  return null;
}

/** 앞 구간 끝과 뒤 구간 시작 사이의 한가운데 — 쉼을 오디오에서 못 찾았을 때의 절단점. 두 구간이 겹치면 null */
export function gapMid(prevEndSec: number, nextStartSec: number): number | null {
  return nextStartSec >= prevEndSec ? (prevEndSec + nextStartSec) / 2 : null;
}

/**
 * 배속 조각 경계 — 첫 원소는 첫 턴 시작, 나머지는 앞 턴 끝과 이 턴 시작 사이 쉼의 한가운데.
 * 발화 시작점에서 바로 자르면 첫 자음이 깎일 수 있어 쉼 가운데로 둔다. 쉼 앞 절반은 앞 화자, 뒤 절반은 뒤 화자의 배속을 따른다.
 */
export function pieceBounds(spans: { start: number; end: number }[]): number[] {
  return spans.map((sp, i) => (i === 0 ? sp.start : gapMid(spans[i - 1].end, sp.start) ?? sp.start));
}
