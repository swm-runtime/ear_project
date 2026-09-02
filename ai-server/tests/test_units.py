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
