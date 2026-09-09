"""Secrets Manager 에서 받은 JSON 으로 .env.prod 의 비밀 항목만 덮어쓴다.

비밀이 아닌 설정(도메인·앱 버전 등)의 원천은 여전히 .env.prod 다 — 그래서 파일을 새로
만들지 않고 해당 키의 줄만 치환한다. 값은 출력하지 않는다.

`.env.prod` 에 키가 아예 없으면 **추가하지 않고 실패시킨다.** 파일에 없다는 것은 이 서버가
그 값을 안 쓴다는 뜻일 수 있어, 조용히 늘리는 쪽이 더 위험하다
(tickets/backend/archive/deploy-path-reads-secrets-manager.md).
"""
import json
import sys

secret_path, env_path = sys.argv[1], sys.argv[2]
with open(secret_path, encoding="utf-8") as f:
    secrets = json.load(f)
if not secrets:
    sys.exit("시크릿이 비어 있다 — .env.prod 를 건드리지 않는다")

with open(env_path, encoding="utf-8") as f:
    lines = f.read().splitlines()

seen = set()
for i, line in enumerate(lines):
    if "=" not in line or line.lstrip().startswith("#"):
        continue
    key = line.split("=", 1)[0].strip()
    if key in secrets:
        lines[i] = "%s=%s" % (key, secrets[key])
        seen.add(key)

missing = sorted(set(secrets) - seen)
if missing:
    sys.exit("`.env.prod` 에 없는 키다 — 수동 확인 필요: %s" % ", ".join(missing))

with open(env_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("[secrets] %d 개 항목 갱신" % len(seen))
