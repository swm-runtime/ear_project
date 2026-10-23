/**
 * 일회성 스크립트 표시 — **스크립트의 첫 import 로 둔다**(AppModule 보다 먼저 평가돼야 한다).
 *
 * 스크립트는 클러스터 워커가 아니라서 `isSchedulerProcess()`가 참이 되고, 그러면 AppModule 이 `ScheduleModule`을 등록하고
 * 편성 배치의 "미완료 재개"(`DripBatchScheduler.onApplicationBootstrap`)까지 돈다 — 05:00 배치 중에 스크립트를 돌리면 운영
 * 워커와 같은 배치를 두 번 돌리고 `app.close()`가 중간에 끊는다(2026-10-23 검토). 이 표시가 있으면 스케줄러를 맡지 않는다
 */
process.env.EAR_ONE_OFF_SCRIPT = 'true';

export {};
