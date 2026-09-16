/** 현재 작업의 중단 신호 (2026-09-12 작업 취소): index.ts 가 작업마다 세팅하고, CLI 실행기는 abort 시 claude 자식 프로세스를 죽인다. 별도 모듈 — index.ts↔claude-cli.ts 순환 참조 회피 */
let jobAbort: AbortController | null = null;
export function setJobAbort(ac: AbortController | null) { jobAbort = ac; }
export function jobAbortSignal(): AbortSignal | null { return jobAbort?.signal ?? null; }
