"""Render the actual local pages at desktop and mobile sizes."""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import shutil
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
PAGES = ("upload", "total-assets", "portfolio", "aditya", "retirement")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def browser_session():
    """Use a temporary local server, and shut down only what we started."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            executable = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium")
            options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if executable:
                options["executable_path"] = executable
            browser = playwright.chromium.launch(**options)
            try:
                yield browser, f"http://127.0.0.1:{server.server_port}"
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def main():
    out = ROOT / "assets" / "screenshots"
    out.mkdir(parents=True, exist_ok=True)
    with browser_session() as (browser, origin):
        for width, height, suffix in ((1600, 900, "1600x900"), (390, 844, "mobile")):
            context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            for name in PAGES:
                page.goto(f"{origin}/{name}.html", wait_until="networkidle")
                page.screenshot(path=str(out / f"{name}-{suffix}.png"), full_page=suffix == "mobile")
                assert not errors, f"{name}: {errors}"
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{name}: page overflows"
                print(f"{name}: {suffix} rendered; no JavaScript errors or page overflow")
            context.close()


if __name__ == "__main__":
    main()
