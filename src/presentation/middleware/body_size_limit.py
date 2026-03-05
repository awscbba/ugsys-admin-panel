"""Request body size limit middleware.

Rejects any request whose body exceeds 1 MB (1,048,576 bytes) with
HTTP 413 Payload Too Large, without forwarding the request to any
downstream handler or service.

The check is performed by reading the ``Content-Length`` header first
(fast path) and, when the header is absent, by streaming the body and
counting bytes until the limit is reached.

Requirements: 13.3
"""

from __future__ import annotations

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

_MAX_BODY_BYTES: int = 1 * 1024 * 1024  # 1 MB

_RESPONSE_413 = JSONResponse(
    status_code=413,
    content={
        "error": "PAYLOAD_TOO_LARGE",
        "message": "Request body exceeds the 1 MB limit.",
        "data": {},
    },
)


class BodySizeLimitMiddleware:
    """ASGI middleware that enforces a 1 MB request body size limit.

    Implemented as a raw ASGI middleware (not ``BaseHTTPMiddleware``) so
    that it can intercept the body stream before FastAPI parses it,
    avoiding memory issues with very large payloads.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = _MAX_BODY_BYTES) -> None:
        self._app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        request = Request(scope, receive)

        # Fast path: check Content-Length header.
        content_length_str = request.headers.get("content-length")
        if content_length_str is not None:
            try:
                content_length = int(content_length_str)
            except ValueError:
                content_length = 0
            if content_length > self._max_bytes:
                response = _RESPONSE_413
                await response(scope, receive, send)
                return

        # Slow path: stream the body and count bytes.
        # We wrap the receive callable to intercept body chunks.
        total_bytes = 0
        body_chunks: list[bytes] = []
        too_large = False

        async def limited_receive() -> dict:  # type: ignore[type-arg]
            nonlocal total_bytes, too_large
            message = await receive()
            if message["type"] == "http.request":
                chunk: bytes = message.get("body", b"")
                total_bytes += len(chunk)
                if total_bytes > self._max_bytes:
                    too_large = True
                    # Return an empty body to stop further processing.
                    return {**message, "body": b"", "more_body": False}
                body_chunks.append(chunk)
            return message

        # Peek at the body only for methods that typically carry a body.
        method = scope.get("method", "GET")
        if method in ("POST", "PUT", "PATCH"):
            # Read the full body through our limited_receive to check size.
            # We need to reconstruct the receive callable for the app.
            full_body = b""
            more_body = True
            while more_body:
                message = await limited_receive()
                if too_large:
                    response = _RESPONSE_413
                    await response(scope, receive, send)
                    return
                full_body += message.get("body", b"")
                more_body = message.get("more_body", False)

            # Reconstruct a receive callable that replays the buffered body.
            body_sent = False

            async def replay_receive() -> dict:  # type: ignore[type-arg]
                nonlocal body_sent
                if not body_sent:
                    body_sent = True
                    return {"type": "http.request", "body": full_body, "more_body": False}
                # Subsequent calls block (simulates a disconnected client).
                return {"type": "http.disconnect"}

            await self._app(scope, replay_receive, send)
        else:
            await self._app(scope, receive, send)
