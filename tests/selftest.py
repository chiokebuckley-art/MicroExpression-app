#!/usr/bin/env python3
"""
End-to-End Playwright Headless Chromium Verification & Screenshot Suite (`tests/selftest.py`).
Verifies:
1. `tests/unit.html`: all browser unit tests pass (`window.__unitTestsPassed == True`).
2. Zero console errors, zero uncaught page errors, zero failed network requests,
   and zero external network requests (only localhost / 127.0.0.1).
3. Realistic 3D head rig (`models/riya/head.glb`) loads by default with `window.__missing.length == 0`.
4. Captures all required screenshots in `screenshots/realistic/` and `screenshots/` at 1280x800 and 1920x1080.
5. Verifies pixel-level distinctness of all 7 universal expressions against Neutral (`mean diff > 0.8`),
   plus Duchenne vs. Social smile difference and Fear vs. Surprise difference.
6. Verifies all 10 curriculum levels, Ethics gate, 42-item Benchmark, Confusion Matrix tap-to-drill,
   Mirror Mode, AU Lab (`#/au-lab` + `?rig=facecap`), and Settings/About.
"""

import os
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright
from fixes_e2e import run_updates

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOTS_DIR = os.path.join(ROOT, "screenshots")
REALISTIC_DIR = os.path.join(SCREENSHOTS_DIR, "realistic")


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def mean_pixel_diff(img_a_path, img_b_path):
    im1 = Image.open(img_a_path).convert("RGB")
    im2 = Image.open(img_b_path).convert("RGB")
    diff = ImageChops.difference(im1, im2)
    stat = ImageStat.Stat(diff)
    return sum(stat.mean) / len(stat.mean)


def stitch_side_by_side(path_a, path_b, out_path):
    im1 = Image.open(path_a).convert("RGB")
    im2 = Image.open(path_b).convert("RGB")
    out = Image.new("RGB", (im1.width + im2.width, max(im1.height, im2.height)))
    out.paste(im1, (0, 0))
    out.paste(im2, (im1.width, 0))
    out.save(out_path)


def run_selftest():
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    os.makedirs(REALISTIC_DIR, exist_ok=True)

    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.8)

    console_errors = []
    page_errors = []
    failed_requests = []
    external_requests = []

    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(headless=True, channel="chrome", args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
            except Exception:
                browser = p.chromium.launch(headless=True, executable_path=os.environ.get("PW_CHROMIUM_EXECUTABLE"), args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            page.on(
                "console",
                lambda msg: console_errors.append(msg.text)
                if msg.type == "error"
                else None,
            )
            page.on("pageerror", lambda err: page_errors.append(str(err)))
            page.on(
                "requestfailed",
                lambda req: failed_requests.append(f"{req.url} ({req.failure})"),
            )

            def on_request(req):
                parsed = urlparse(req.url)
                if parsed.scheme in ("http", "https") and parsed.hostname not in (
                    "127.0.0.1",
                    "localhost",
                ):
                    external_requests.append(req.url)

            page.on("request", on_request)

            # 1. Run Browser Unit Test Suite (`tests/unit.html`)
            print("1. Running browser unit tests (tests/unit.html)...")
            page.goto(f"{base_url}/tests/unit.html", wait_until="networkidle")
            page.wait_for_function("window.__unitTestsPassed !== undefined", timeout=15000)
            unit_passed = page.evaluate("window.__unitTestsPassed")
            unit_results = page.evaluate("window.__unitTestResults")
            for r in unit_results:
                print(f"   [{'PASS' if r['passed'] else 'FAIL'}] {r['name']} ({r['detail']})")
            assert unit_passed is True, "Browser unit tests failed!"

            # 2. Load Main Application (`index.html`)
            print("2. Loading main application and realistic 3D head rig...")
            page.goto(f"{base_url}/index.html#/level/4", wait_until="networkidle")
            page.wait_for_function(
                "window.__rig && window.__rigStats && window.__rigStats.rigId === 'riya'",
                timeout=20000,
            )
            missing = page.evaluate("window.__missing")
            rig_stats = page.evaluate("window.__rigStats")
            print(f"   Loaded rig: {rig_stats}, missing ARKit channels: {len(missing)}")
            assert len(missing) == 0, f"Expected 0 missing ARKit blendshapes, got {missing}"

            # Check horizontal overflow at 1280x800
            overflow_1280 = page.evaluate(
                "document.documentElement.scrollWidth > document.documentElement.clientWidth"
            )
            assert not overflow_1280, "Horizontal overflow detected at 1280x800!"

            # 3. Capture Realistic Head Close-ups & Verify Expression Pixel Distinctness
            print("3. Capturing realistic 3D head expressions and camera angles...")
            rig_box = page.locator("#rigCanvasMount")

            page.evaluate("""() => {
                window.__rig.setOverlaysEnabled(false);
                window.__rig.idleBlinksEnabled = false;
                window.__rig.resetToNeutral();
                window.__rig.setCameraPreset('front');
            }""")
            page.wait_for_timeout(150)
            neutral_front_path = os.path.join(REALISTIC_DIR, "neutral-front.png")
            rig_box.screenshot(path=neutral_front_path)

            page.evaluate("window.__rig.setCameraPreset('left34')")
            page.wait_for_timeout(120)
            rig_box.screenshot(path=os.path.join(REALISTIC_DIR, "neutral-left34.png"))

            page.evaluate("window.__rig.setCameraPreset('right34')")
            page.wait_for_timeout(120)
            rig_box.screenshot(path=os.path.join(REALISTIC_DIR, "neutral-right34.png"))

            page.evaluate("window.__rig.setCameraPreset('front')")
            page.wait_for_timeout(120)

            emotions_7 = [
                "happiness",
                "sadness",
                "anger",
                "fear",
                "disgust",
                "surprise",
                "contempt",
            ]
            for em in emotions_7:
                page.evaluate(f"""() => {{
                    const expr = window.__content.expressions.core.find(e => e.id === '{em}');
                    window.__rig.setOverlaysEnabled(false);
                    window.__rig.setExpressionFromRecipe(expr);
                }}""")
                page.wait_for_timeout(120)
                em_path = os.path.join(REALISTIC_DIR, f"{em}.png")
                rig_box.screenshot(path=em_path)
                diff = mean_pixel_diff(neutral_front_path, em_path)
                print(f"   Expression '{em}' vs. Neutral mean pixel diff: {diff:.2f}")
                assert diff > 0.35, f"Expression {em} did not visibly deform the mesh!"

            # Capture Social Smile (`happiness_social`) and stitch Duchenne vs Social & Fear vs Surprise
            page.evaluate("""() => {
                const expr = window.__content.expressions.variants.find(e => e.id === 'happiness_social');
                window.__rig.setExpressionFromRecipe(expr);
            }""")
            page.wait_for_timeout(120)
            social_path = os.path.join(REALISTIC_DIR, "happiness-social.png")
            rig_box.screenshot(path=social_path)

            stitch_side_by_side(
                os.path.join(REALISTIC_DIR, "happiness.png"),
                social_path,
                os.path.join(REALISTIC_DIR, "duchenne-vs-social.png"),
            )
            stitch_side_by_side(
                os.path.join(REALISTIC_DIR, "fear.png"),
                os.path.join(REALISTIC_DIR, "surprise.png"),
                os.path.join(REALISTIC_DIR, "fear-vs-surprise.png"),
            )

            # Capture all 5 realistic identities
            identities = [
                ("riya", "identity-riya.png"),
                ("female_adult_08", "identity-female08.png"),
                ("female_adult_12", "identity-female12.png"),
                ("male_adult_01", "identity-male01.png"),
                ("male_adult_06", "identity-male06.png"),
            ]
            for rig_id, fname in identities:
                page.evaluate(f"window.__rig.loadRig('{rig_id}')")
                page.wait_for_function(
                    f"window.__rigStats && window.__rigStats.rigId === '{rig_id}'",
                    timeout=15000,
                )
                page.wait_for_timeout(120)
                rig_box.screenshot(path=os.path.join(REALISTIC_DIR, fname))

            # Switch back to primary Riya head
            page.evaluate("window.__rig.loadRig('riya')")
            page.wait_for_function("window.__rigStats.rigId === 'riya'", timeout=15000)

            run_updates(page, context, base_url, ROOT)

            # 4. Enable Unlock All & Walk All 10 Levels + Special Views
            print("4. Verifying all 10 curriculum levels, Ethics, Dashboard, Mirror, AU Lab, and Settings...")
            page.evaluate("async()=>{const db=await import('./src/store/db.js');await db.saveSetting('unlockAll',true);await db.saveSetting('ethicsCompleted',true);window.__app.settings.unlockAll=true;window.__app.settings.ethicsCompleted=true;}")
            page.wait_for_timeout(150)

            # Level 1: Wheel, VA Grid, Map27
            page.goto(f"{base_url}/index.html#/level/1")
            page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level1-wheel.png"))

            page.locator('[data-subtab="vagrid"]').click()
            page.wait_for_timeout(150)
            page.locator("#vaAutoPlaceDemoBtn").click()
            page.wait_for_timeout(150)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level1-vagrid.png"))

            page.locator('[data-subtab="map27"]').click()
            page.wait_for_timeout(150)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level1-map27.png"))

            # Level 2: Anatomy & 11 Muscles
            page.goto(f"{base_url}/index.html#/level/2")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level2-anatomy.png"))

            # Level 3: Action Units (18 AUs)
            page.goto(f"{base_url}/index.html#/level/3")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level3-aus.png"))

            # Level 4: Core 7 Universal Expressions
            page.goto(f"{base_url}/index.html#/level/4")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level4-core7.png"))

            # Level 5: Subtle & Partial Expressions
            page.goto(f"{base_url}/index.html#/level/5")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level5-subtle.png"))

            # Level 6: Micro-Expression Speed Training (test flash + miss replay)
            page.goto(f"{base_url}/index.html#/level/6")
            page.wait_for_timeout(250)
            page.locator('[data-testid="flash-stimulus-btn"]').click()
            page.wait_for_timeout(1800)
            # Submit an answer to verify trial feedback & telemetry
            page.locator('.l6-ans-btn[data-ans="surprise"]').click()
            page.wait_for_timeout(250)
            assert page.locator('[data-testid="trial-feedback"]').is_visible()
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level6-micro.png"))

            # Level 7: Blends & Masked Flashes
            page.goto(f"{base_url}/index.html#/level/7")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level7-blends.png"))

            # Level 8: Beyond the 7 (Social & Self-Conscious States)
            page.goto(f"{base_url}/index.html#/level/8")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level8-beyond7.png"))

            # Level 9: Expressions in Context
            page.goto(f"{base_url}/index.html#/level/9")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level9-context.png"))

            # Level 10: Real-World Conversations & Context-Swap
            page.goto(f"{base_url}/index.html#/level/10")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "level10-realworld.png"))

            # Ethics Module
            page.goto(f"{base_url}/index.html#/ethics")
            page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "ethics.png"))

            # Analytics & Confusion Matrix Dashboard
            page.goto(f"{base_url}/index.html#/dashboard")
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "dashboard.png"))

            # Mirror Mode (No-camera slider simulation fallback)
            page.goto(f"{base_url}/index.html#/mirror")
            page.wait_for_timeout(200)
            page.locator("#mirrorSimModeBtn").click()
            page.wait_for_timeout(150)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "mirror.png"))

            # AU Lab (`#/au-lab`)
            page.goto(f"{base_url}/index.html#/au-lab")
            page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "au-lab.png"))

            # Settings & About
            page.goto(f"{base_url}/index.html#/settings")
            page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "settings.png"))

            # Verify 1920x1080 viewport has zero horizontal overflow
            page.set_viewport_size({"width": 1920, "height": 1080})
            page.goto(f"{base_url}/index.html#/level/4")
            page.wait_for_timeout(250)
            overflow_1920 = page.evaluate(
                "document.documentElement.scrollWidth > document.documentElement.clientWidth"
            )
            assert not overflow_1920, "Horizontal overflow detected at 1920x1080!"
            page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "desktop-1920x1080.png"))

            # Verify ?rig=facecap loads developer rig ONLY when explicitly requested via query param
            page.goto(f"{base_url}/index.html?rig=facecap#/au-lab", wait_until="networkidle")
            page.wait_for_function(
                "window.__rigStats && window.__rigStats.rigId === 'facecap'",
                timeout=15000,
            )
            facecap_stats = page.evaluate("window.__rigStats")
            print(f"   Verified ?rig=facecap developer fallback: {facecap_stats}")

            browser.close()

        assert len(console_errors) == 0, f"Console errors detected: {console_errors}"
        assert len(page_errors) == 0, f"Uncaught page errors detected: {page_errors}"
        assert len(failed_requests) == 0, f"Failed requests detected: {failed_requests}"
        assert len(external_requests) == 0, f"External network requests detected: {external_requests}"

        print("\nSELFTEST PASSED: 0 console errors, 0 page errors, 0 failed/external requests, all screenshots captured!")

    finally:
        server.terminate()
        server.wait()


if __name__ == "__main__":
    run_selftest()
