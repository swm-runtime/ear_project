// CloudFront Function (viewer-request, runtime cloudfront-js-2.0)
//
// /play/<contentId>  →  /<S3 키>   (KeyValueStore: contentId → 키)
//
// 저장소 키는 URL에 실리지 않는다(domain.md 5.1). 매핑은 deploy/upload-audio.sh가 업로드
// 시점에 KVS에 넣는다. 서명(Policy/Signature/Key-Pair-Id) 쿼리는 건드리지 않는다 —
// 검증은 CloudFront가 이 함수 다음에 한다.
import cf from 'cloudfront';

const kvs = cf.kvs();
const PLAY = /^\/play\/([0-9a-fA-F-]{36})$/;

async function handler(event) {
  const request = event.request;
  const match = PLAY.exec(request.uri);

  if (!match) {
    return notFound();
  }

  let key;
  try {
    key = await kvs.get(match[1].toLowerCase());
  } catch (e) {
    // KVS에 없음 = 아직 업로드 안 됐거나 회수됨. 존재 여부를 구분해 주지 않는다
    return notFound();
  }

  request.uri = '/' + key;
  return request;
}

function notFound() {
  return {
    statusCode: 404,
    statusDescription: 'Not Found',
    headers: { 'cache-control': { value: 'no-store' } },
  };
}
