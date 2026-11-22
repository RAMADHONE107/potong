from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path(__file__).resolve().parent.parent / "artifacts" / "ui"
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    page.goto(BASE, wait_until="networkidle")
    print("landing h1:", page.locator("h1").first.inner_text().replace("\n", " "))
    print("landingcta:", page.locator(".p-form button").first.inner_text())
    page.screenshot(path=str(OUT / "landing.png"), full_page=True)

    page.get_by_role("link", name="Buka workspace").click()
    page.wait_for_url("**/login**")
    page.get_by_role("button", name="Lanjut dengan akun lokal").click()
    page.wait_for_url("**/dashboard**", timeout=30000)
    page.wait_for_load_state("networkidle")
    print("dashboard:", page.locator(".p-panel h2").first.inner_text())
    print("daftar pekerjaan:", page.locator(".p-job").count())
    page.screenshot(path=str(OUT / "dashboard.png"), full_page=True)

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(BASE, wait_until="networkidle")
    overflow = mobile.evaluate(
        "document.documentElement.scrollWidth > window.innerWidth + 1"
    )
    print("mobile overflow:", overflow)
    mobile.screenshot(path=str(OUT / "landing-mobile.png"), full_page=True)

    print("page errors:", errors)
    browser.close()
