import os
import socket
import sys
import threading
import time
import traceback
import webbrowser

from app.core.paths import get_log_path


LOG_PATH = get_log_path()
DEFAULT_PORT = 8000
STARTUP_TIMEOUT_S = 30.0

if sys.stdin is None:
    sys.stdin = open(os.devnull, "r", encoding="utf-8")
if sys.stdout is None or sys.stderr is None:
    _log_file = open(LOG_PATH, "a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = _log_file
    if sys.stderr is None:
        sys.stderr = _log_file


def _show_error(msg: str) -> None:
    try:
        if sys.platform == "darwin":
            import subprocess
            safe = msg[:400].replace('"', "'")
            subprocess.run(
                ["osascript", "-e", f'display alert "Errore avvio Syneso" message "{safe}" as critical'],
                check=False,
            )
            return
        import tkinter as tk
        from tkinter import messagebox
        r = tk.Tk()
        r.withdraw()
        messagebox.showerror("Errore avvio Syneso", msg)
        r.destroy()
    except Exception:
        pass


def _pick_free_port(preferred: int = DEFAULT_PORT) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", preferred)) != 0:
            return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    server = None
    t_srv = None
    try:
        from app.config import APP_BASE_DIR
        from app.core.health import probe_syneso, wait_until_ready

        default_url = f"http://127.0.0.1:{DEFAULT_PORT}"
        if probe_syneso(default_url):
            url = default_url
        else:
            import uvicorn
            from app.main import app

            port = _pick_free_port(DEFAULT_PORT)
            url = f"http://127.0.0.1:{port}"
            config = uvicorn.Config(
                app,
                host="127.0.0.1",
                port=port,
                log_level="warning",
                use_colors=False,
            )
            server = uvicorn.Server(config)
            server_thread = threading.Thread(target=server.run, daemon=True)
            server_thread.start()
            t_srv = server_thread
            if not wait_until_ready(
                url,
                timeout_s=STARTUP_TIMEOUT_S,
                should_abort=lambda: not server_thread.is_alive(),
            ):
                raise RuntimeError(
                    f"Il server locale di Syneso non si è avviato su {url} "
                    f"entro {STARTUP_TIMEOUT_S:.0f} secondi."
                )

        try:
            import webview

            webview.settings["ALLOW_DOWNLOADS"] = True
            webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True

            storage_dir = APP_BASE_DIR / "webview_storage"
            storage_dir.mkdir(parents=True, exist_ok=True)

            window = webview.create_window(
                "Syneso",
                url,
                width=1360,
                height=860,
                min_size=(960, 640),
                text_select=True,
            )

            def _on_closed():
                if server is not None:
                    server.should_exit = True

            window.events.closed += _on_closed
            webview.start(
                private_mode=False,
                storage_path=str(storage_dir),
            )
        except Exception as gui_err:
            print(f"⚠️ [Syneso] Fallback browser ({gui_err})", file=sys.stderr, flush=True)
            webbrowser.open(url)
            while t_srv is not None and t_srv.is_alive():
                time.sleep(0.5)
        finally:
            if server is not None:
                server.should_exit = True
    except Exception:
        err = traceback.format_exc()
        print(err, file=sys.stderr, flush=True)
        _show_error(f"{err}\n\nLog salvato in:\n{LOG_PATH}")
        sys.exit(1)


if __name__ == "__main__":
    main()
