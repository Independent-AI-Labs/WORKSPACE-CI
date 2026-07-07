"""HTTP client for markdown-docs remote URL probing.

Extracted from check_markdown_docs.py to keep that module under the
512-line file-length limit. Provides bounded-concurrency async probing
with a global wallclock budget.
"""

from __future__ import annotations

import asyncio
import sys
from http import HTTPStatus

import httpx

YELLOW = "\033[93m"
RESET = "\033[0m"

GLOBAL_BUDGET_SECONDS = 30.0
MAX_CONCURRENCY = 10
HTTP_OK_MIN = HTTPStatus.OK
HTTP_REDIRECT_MAX = HTTPStatus.BAD_REQUEST


class HttpClient:
    """Async parallel URL prober with bounded concurrency + global budget.

    Probes are run concurrently (default 10 in flight) with a hard
    wallclock budget (default 30s). Each probe tries HEAD first, falls
    back to GET if the server refuses. Results are cached so repeated
    URL references are probed once per run.

    NO error swallowing:
      - Per-probe error  -> recorded as ``(False, "<ExcType>: <msg>")``,
        surfaces as a Finding ("unreachable URL: ...").
      - Global budget exhaustion -> remaining unprobed URLs return
        ``(False, "global budget exceeded")``, surface as Findings too.
      - asyncio.CancelledError from budget timeout propagates as a
        visible stderr warning and the run still returns all findings
        collected before the timeout fired.
    """

    def __init__(self, timeout: float) -> None:
        self._timeout = timeout
        self._headers = {"user-agent": "ci-md-validator/0.1"}
        self._cache: dict[str, tuple[bool, str]] = {}
        self._budget_exceeded = False

    def prewarm(self, urls: list[str]) -> None:
        """Probe all ``urls`` in parallel; populate cache. Sync wrapper.

        Uses asyncio.run to drive the async probe loop. Safe to call
        once after parse phase so check() becomes a pure cache lookup.
        """
        if not urls:
            return
        try:
            asyncio.run(self._probe_all(urls))
        except (httpx.HTTPError, RuntimeError) as exc:
            print(
                f"{YELLOW}warning:{RESET} remote probe batch failed: {exc}",
                file=sys.stderr,
            )
            for url in urls:
                if url not in self._cache:
                    self._cache[url] = (False, f"batch error: {type(exc).__name__}")

    async def _probe_all(self, urls: list[str]) -> None:
        sem = asyncio.Semaphore(MAX_CONCURRENCY)
        async with httpx.AsyncClient(
            timeout=self._timeout,
            follow_redirects=True,
            headers=self._headers,
        ) as client:
            tasks = [asyncio.create_task(self._probe_one(client, sem, u)) for u in urls]
            try:
                await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=GLOBAL_BUDGET_SECONDS,
                )
            except TimeoutError:
                self._budget_exceeded = True
                print(
                    f"{YELLOW}warning:{RESET} global URL-probe budget "
                    f"({GLOBAL_BUDGET_SECONDS:.0f}s) exceeded; cancelling "
                    f"{len(tasks)} in-flight probes",
                    file=sys.stderr,
                )
                for t in tasks:
                    if not t.done():
                        t.cancel()
                for t, url in zip(tasks, urls, strict=True):
                    if t.cancelled() and url not in self._cache:
                        self._cache[url] = (False, "global budget exceeded")

    async def _probe_one(
        self,
        client: httpx.AsyncClient,
        sem: asyncio.Semaphore,
        url: str,
    ) -> None:
        if url in self._cache:
            return
        async with sem:
            for method in ("HEAD", "GET"):
                try:
                    r = await client.request(method, url)
                except httpx.RequestError as exc:
                    self._cache[url] = (False, f"{type(exc).__name__}: {exc}")
                    return
                if HTTP_OK_MIN <= r.status_code < HTTP_REDIRECT_MAX:
                    self._cache[url] = (True, f"{r.status_code}")
                    return
                if method == "HEAD":
                    continue
                self._cache[url] = (False, f"HTTP {r.status_code}")
                return
        self._cache[url] = (False, "no response")

    def check(self, url: str) -> tuple[bool, str]:
        """Sync lookup against prewarmed cache; prewarm() must run first.

        If ``check()`` is called for a URL not in cache (e.g. an exception
        path skipped prewarm), returns a visible budget-exceeded warning
        rather than performing a synchronous probe: never hangs.
        """
        if url in self._cache:
            return self._cache[url]
        return (False, "global budget exceeded (URL not prewarmed)")

    def close(self) -> None:
        pass
