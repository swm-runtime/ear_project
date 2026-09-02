"""POST /embeddings 계약 테스트 — stub 제공자로 모델 호출 없이 검증한다."""

import math

import pytest
from fastapi.testclient import TestClient

TOKEN = "test-internal-token"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "stub")
    monkeypatch.setenv("EMBEDDING_DIM", "32")
    monkeypatch.setenv("EMBEDDING_CHUNK_CHARS", "50")
    monkeypatch.setenv("INTERNAL_AUTH_TOKEN", TOKEN)

    from app.config import get_settings
    from app.main import create_app

    get_settings.cache_clear()

    try:
        yield TestClient(create_app())
    finally:
        get_settings.cache_clear()


def post(client: TestClient, text: str, token: str = TOKEN):
    return client.post("/embeddings", json={"text": text}, headers={"X-Internal-Token": token})


def test_내부_토큰이_없거나_틀리면_401이다(client):
    assert client.post("/embeddings", json={"text": "대본"}).status_code == 401
    assert post(client, "대본", token="wrong").status_code == 401


def test_단위_벡터와_모델_식별자를_돌려준다(client):
    response = post(client, "ISA 계좌의 비과세 한도를 설명하는 대본")

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "dev-stub"
    assert body["dim"] == 32
    assert len(body["vector"]) == 32

    norm = math.sqrt(sum(v * v for v in body["vector"]))
    assert norm == pytest.approx(1.0, abs=1e-6)


def test_같은_텍스트는_같은_벡터다(client):
    first = post(client, "같은 대본").json()["vector"]
    second = post(client, "같은 대본").json()["vector"]

    assert first == second
    assert post(client, "다른 대본").json()["vector"] != first


def test_한도를_넘는_대본은_청킹을_거쳐도_단위_벡터다(client):
    long_text = "복리 계산과 예적금 금리 비교에 대한 문장입니다. " * 30  # chunk_chars(50)의 수십 배

    response = post(client, long_text)

    assert response.status_code == 200
    vector = response.json()["vector"]
    norm = math.sqrt(sum(v * v for v in vector))
    assert norm == pytest.approx(1.0, abs=1e-6)


def test_빈_텍스트는_422다(client):
    assert post(client, "").status_code == 422


def test_health는_인증_없이_열려_있다(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
