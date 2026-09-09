/**
 * admin.md 미결 "업로드 대상 파일 규격" — 상한은 아직 확정되지 않았다. 여기 값은 서버 보호용
 * 임시 상한이며, 규격이 확정되면 이 상수만 바꾼다.
 */
export const MAX_AUDIO_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_THUMBNAIL_FILE_BYTES = 5 * 1024 * 1024;

/** enrichment.json — 벡터 1536개 float라도 수십 KB다. 1MB면 넉넉한 보호 상한 */
export const MAX_ENRICHMENT_FILE_BYTES = 1 * 1024 * 1024;

/** admin.md 3.1 — mp3 / m4a */
export const AUDIO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};

export const THUMBNAIL_CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** 관리자 목록 페이지 크기 (convention.md 3.3 — 기본 20 / 최대 50) */
export const ADMIN_LIST_DEFAULT_LIMIT = 20;
export const ADMIN_LIST_MAX_LIMIT = 50;

/** 저장소 키의 무작위 부분 길이(hex). 제목이 URL·DB에 새지 않게 한다(deploy/upload-audio.sh와 동일) */
export const STORAGE_KEY_RANDOM_BYTES = 16;

export const AUDIO_KEY_PREFIX = 'audio/';
export const THUMBNAIL_KEY_PREFIX = 'thumb/';

/** audit_logs.action 값 */
export const AUDIT_ACTION_CONTENT_UPLOAD = 'content.upload';
export const AUDIT_ACTION_CONTENT_REPUBLISH = 'content.republish';
/** 재발행 없이 추천 메타 파일만 반영한 경우 — 버전이 오르지 않아 republish와 구분한다 */
export const AUDIT_ACTION_CONTENT_ENRICH = 'content.enrich';
export const AUDIT_ACTION_CONTENT_WITHDRAW = 'content.withdraw';
export const AUDIT_ACTION_CONTENT_RESTORE = 'content.restore';
/**
 * 저장소 파일 회수 — **되돌릴 수 없다.** 파일이 사라진 뒤 그 콘텐츠가 왜 재생되지
 * 않는지를 이 기록으로만 설명할 수 있다
 */
export const AUDIT_ACTION_CONTENT_PURGE_STORAGE = 'content.purge_storage';
export const AUDIT_ACTION_TOPIC_CREATE = 'topic.create';
export const AUDIT_ACTION_TOPIC_UPDATE = 'topic.update';
export const AUDIT_ACTION_TOPIC_DELETE = 'topic.delete';
