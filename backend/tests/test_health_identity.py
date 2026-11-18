import json
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.core.health import (
    health_payload,
    is_syneso_health_body,
    probe_syneso,
    wait_until_ready,
)


@contextmanager
def _local_server(body: bytes, status: int = 200) -> Iterator[str]:
    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_only_a_syneso_payload_is_recognised():
    assert is_syneso_health_body(json.dumps(health_payload()).encode())
    assert not is_syneso_health_body(b'{"status": "ok"}')
    assert not is_syneso_health_body(b'{"status": "ok", "app": "other"}')
    assert not is_syneso_health_body(b'["ok"]')
    assert not is_syneso_health_body(b"<html>ok</html>")
    assert not is_syneso_health_body(b"")


def test_probe_accepts_syneso_and_rejects_another_service_on_the_port():
    with _local_server(json.dumps(health_payload()).encode()) as url:
        assert probe_syneso(url) is True

    with _local_server(b'{"status": "ok"}') as url:
        assert probe_syneso(url) is False

    with _local_server(json.dumps(health_payload()).encode(), status=503) as url:
        assert probe_syneso(url) is False


def test_probe_is_false_when_nothing_is_listening():
    with _local_server(b"{}") as url:
        closed_url = url
    assert probe_syneso(closed_url, timeout_s=0.3) is False


def test_wait_until_ready_returns_as_soon_as_syneso_answers():
    with _local_server(json.dumps(health_payload()).encode()) as url:
        assert wait_until_ready(url, timeout_s=5.0) is True


def test_wait_until_ready_stops_early_when_the_server_is_gone():
    with _local_server(b"{}") as url:
        closed_url = url

    checks: list[int] = []

    def _server_died() -> bool:
        checks.append(1)
        return True

    assert wait_until_ready(closed_url, timeout_s=30.0, should_abort=_server_died) is False
    assert len(checks) == 1


def test_health_endpoint_identifies_the_app(client):
    res = client.get("/health")

    assert res.status_code == 200
    assert is_syneso_health_body(res.content)
