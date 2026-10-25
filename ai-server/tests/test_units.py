"""청킹·풀링·설정의 단위 테스트 — 모델 호출 없는 순수 계산."""

import math

import pytest

from app.config import ConfigError, load_settings
from app.services.embedding.chunker import chunk_text
from app.services.embedding.pooling import l2_normalize, mean_pool


class TestChunkText:
    def test_한도_이하면_한_덩어리다(self):
        assert chunk_text("짧은 대본", 100) == ["짧은 대본"]

    def test_한도를_넘으면_공백_경계에서_나뉜다(self):
        text = "가나다 라마바 사아자"
        chunks = chunk_text(text, 8)

        assert len(chunks) > 1
        assert "".join(chunks).replace(" ", "") == text.replace(" ", "")

    def test_공백_없는_입력도_무한_루프_없이_잘린다(self):
        chunks = chunk_text("a" * 25, 10)

        assert chunks == ["a" * 10, "a" * 10, "a" * 5]

    def test_빈_입력은_거부한다(self):
        with pytest.raises(ValueError):
            chunk_text("   ", 10)


class TestPooling:
    def test_평균과_정규화(self):
        pooled = mean_pool([[1.0, 0.0], [0.0, 1.0]])
        assert pooled == [0.5, 0.5]

        normalized = l2_normalize(pooled)
        norm = math.sqrt(sum(v * v for v in normalized))
        assert norm == pytest.approx(1.0)

    def test_차원이_다르면_거부한다(self):
        with pytest.raises(ValueError):
            mean_pool([[1.0], [1.0, 2.0]])

    def test_영벡터는_정규화할_수_없다(self):
        with pytest.raises(ValueError):
            l2_normalize([0.0, 0.0])


class TestLoadSettings:
    def test_내부_토큰이_없으면_기동을_실패시킨다(self, monkeypatch):
        monkeypatch.delenv("INTERNAL_AUTH_TOKEN", raising=False)

        with pytest.raises(ConfigError):
            load_settings()

    def test_openai_제공자는_모델과_키를_요구한다(self, monkeypatch):
        monkeypatch.setenv("INTERNAL_AUTH_TOKEN", "t")
        monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
        monkeypatch.delenv("EMBEDDING_MODEL", raising=False)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)

        with pytest.raises(ConfigError):
            load_settings()

    def test_stub은_고정_모델명과_기본_차원을_쓴다(self, monkeypatch):
        monkeypatch.setenv("INTERNAL_AUTH_TOKEN", "t")
        monkeypatch.delenv("EMBEDDING_PROVIDER", raising=False)
        monkeypatch.delenv("EMBEDDING_DIM", raising=False)

        settings = load_settings()

        assert settings.provider == "stub"
        assert settings.model == "dev-stub"
        assert settings.dim == 256


class TestOpenAiClient:
    """KAN-253 — 연결 재사용. 실제 OpenAI 를 부르지 않고 MockTransport 로 요청을 센다."""

    def _settings(self, keepalive_sec: int):
        from app.config import Settings

        return Settings(
            provider="openai", model="text-embedding-3-small", dim=4, chunk_chars=4000,
            internal_auth_token="t", openai_api_key="sk-test", openai_base_url="https://example.test/v1",
            keepalive_sec=keepalive_sec,
        )

    def test_같은_클라이언트가_요청을_모두_보내고_index_순서로_돌려준다(self):
        import httpx

        from app.services.embedding.client import OpenAiEmbeddingClient

        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            # 응답을 일부러 뒤집어 보낸다 — index 로 재정렬해야 한다
            return httpx.Response(200, json={"data": [{"index": 1, "embedding": [0, 0, 0, 1]}, {"index": 0, "embedding": [1, 0, 0, 0]}]})

        client = OpenAiEmbeddingClient(self._settings(keepalive_sec=0), transport=httpx.MockTransport(handler))
        try:
            assert client.embed(["a", "b"]) == [[1, 0, 0, 0], [0, 0, 0, 1]]
            client.embed(["c"])
        finally:
            client.close()

        assert len(seen) == 2
        assert all(r.url.path == "/v1/embeddings" for r in seen)
        assert seen[0].headers["authorization"] == "Bearer sk-test"
        body = seen[0].read()
        assert b'"dimensions":4' in body or b'"dimensions": 4' in body

    def test_깨우기는_GET_models_이고_실패해도_예외가_나지_않는다(self):
        import httpx

        from app.services.embedding.client import OpenAiEmbeddingClient

        calls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request.url.path)
            return httpx.Response(500) if len(calls) > 1 else httpx.Response(200, json={"data": []})

        client = OpenAiEmbeddingClient(self._settings(keepalive_sec=0), transport=httpx.MockTransport(handler))
        try:
            assert client.warm() is True
            assert client.warm() is False
        finally:
            client.close()

        assert calls == ["/v1/models", "/v1/models"]
        assert client.warm_count == 1

    def test_keepalive_0이면_스레드를_띄우지_않는다(self):
        import httpx

        from app.services.embedding.client import OpenAiEmbeddingClient

        client = OpenAiEmbeddingClient(self._settings(keepalive_sec=0), transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"data": []})))
        try:
            assert client._warmer is None
        finally:
            client.close()

    def test_build_client는_같은_설정에_같은_인스턴스를_돌려준다(self):
        from app.services.embedding.client import build_client

        settings = self._settings(keepalive_sec=0)
        assert build_client(settings) is build_client(settings)
        build_client.cache_clear()


class TestKeepaliveConfig:
    def test_기본값과_0_허용_음수_거부(self, monkeypatch):
        monkeypatch.setenv("INTERNAL_AUTH_TOKEN", "t")
        monkeypatch.setenv("EMBEDDING_PROVIDER", "stub")
        monkeypatch.delenv("EMBEDDING_KEEPALIVE_SEC", raising=False)
        assert load_settings().keepalive_sec == 55

        monkeypatch.setenv("EMBEDDING_KEEPALIVE_SEC", "0")
        assert load_settings().keepalive_sec == 0

        monkeypatch.setenv("EMBEDDING_KEEPALIVE_SEC", "-1")
        with pytest.raises(ConfigError):
            load_settings()
