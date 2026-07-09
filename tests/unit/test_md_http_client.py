"""Tests for ci._md_http_client: async URL probing with cache."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from ci._md_http_client import HttpClient


def _mock_response(status: int = 200) -> MagicMock:
    r = MagicMock()
    r.status_code = status
    return r


def test_prewarm_empty_does_nothing() -> None:
    c = HttpClient(timeout=5.0)
    c.prewarm([])
    assert c._cache == {}


def test_check_uncached_returns_budget_warning() -> None:
    c = HttpClient(timeout=5.0)
    ok, msg = c.check("https://example.com/x")
    assert ok is False
    assert "not prewarmed" in msg


def test_check_cached_returns_stored_result() -> None:
    c = HttpClient(timeout=5.0)
    c._cache["https://example.com/x"] = (True, "200")
    ok, msg = c.check("https://example.com/x")
    assert ok is True
    assert msg == "200"


def test_prewarm_success_caches_true() -> None:
    c = HttpClient(timeout=5.0)
    resp = _mock_response(200)

    async def fake_request(method, url):
        return resp

    client = MagicMock()
    client.request = fake_request
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    with patch("ci._md_http_client.httpx.AsyncClient", return_value=client):
        c.prewarm(["https://example.com/ok"])

    ok, msg = c.check("https://example.com/ok")
    assert ok is True
    assert "200" in msg


def test_prewarm_head_then_get_fallback() -> None:
    c = HttpClient(timeout=5.0)
    head_resp = _mock_response(405)
    get_resp = _mock_response(200)
    responses = {"HEAD": head_resp, "GET": get_resp}

    async def fake_request(method, url):
        return responses[method]

    client = MagicMock()
    client.request = fake_request
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    with patch("ci._md_http_client.httpx.AsyncClient", return_value=client):
        c.prewarm(["https://example.com/fb"])

    ok, _msg = c.check("https://example.com/fb")
    assert ok is True


def test_prewarm_request_error_caches_false() -> None:
    c = HttpClient(timeout=5.0)

    async def fake_request(method, url):
        raise httpx.ConnectError("refused")

    client = MagicMock()
    client.request = fake_request
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    with patch("ci._md_http_client.httpx.AsyncClient", return_value=client):
        c.prewarm(["https://example.com/err"])

    ok, msg = c.check("https://example.com/err")
    assert ok is False
    assert "ConnectError" in msg


def test_prewarm_http_404_caches_false() -> None:
    c = HttpClient(timeout=5.0)
    resp = _mock_response(404)

    async def fake_request(method, url):
        return resp

    client = MagicMock()
    client.request = fake_request
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    with patch("ci._md_http_client.httpx.AsyncClient", return_value=client):
        c.prewarm(["https://example.com/missing"])

    ok, msg = c.check("https://example.com/missing")
    assert ok is False
    assert "404" in msg


def test_prewarm_runtime_error_caches_batch_error() -> None:
    c = HttpClient(timeout=5.0)

    with patch("ci._md_http_client.asyncio.run", side_effect=RuntimeError("boom")):
        c.prewarm(["https://example.com/rte"])

    ok, msg = c.check("https://example.com/rte")
    assert ok is False
    assert "batch error" in msg


def test_prewarm_httpx_error_caches_batch_error() -> None:
    c = HttpClient(timeout=5.0)

    with patch("ci._md_http_client.asyncio.run", side_effect=httpx.HTTPError("x")):
        c.prewarm(["https://example.com/hx"])

    ok, msg = c.check("https://example.com/hx")
    assert ok is False
    assert "batch error" in msg


def test_prewarm_already_cached_skips_probe() -> None:
    c = HttpClient(timeout=5.0)
    c._cache["https://example.com/c"] = (True, "200")

    async def fake_request(method, url):
        raise AssertionError

    client = MagicMock()
    client.request = fake_request
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    with patch("ci._md_http_client.httpx.AsyncClient", return_value=client):
        c.prewarm(["https://example.com/c"])

    ok, _ = c.check("https://example.com/c")
    assert ok is True


def test_close_is_noop() -> None:
    c = HttpClient(timeout=5.0)
    c.close()


def test_global_budget_exceeded_caches_false() -> None:
    c = HttpClient(timeout=5.0)

    async def fake_wait_for(coro, timeout):
        raise TimeoutError

    async def fake_gather(*tasks, return_exceptions=True):
        return []

    async def fake_request(method, url):
        return _mock_response(200)

    client = MagicMock()
    client.request = fake_request
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    task = MagicMock()
    task.done.return_value = False
    task.cancelled.return_value = True

    with (
        patch("ci._md_http_client.httpx.AsyncClient", return_value=client),
        patch("ci._md_http_client.asyncio.create_task", return_value=task),
        patch("ci._md_http_client.asyncio.wait_for", side_effect=fake_wait_for),
        patch("ci._md_http_client.asyncio.gather", side_effect=fake_gather),
    ):
        c.prewarm(["https://example.com/budget"])

    ok, msg = c.check("https://example.com/budget")
    assert ok is False
    assert "budget exceeded" in msg
