"""
Test script for autonomous teacher agent
"""
from playwright.sync_api import sync_playwright
import time

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.set_viewport_size({"width": 1920, "height": 1080})

        print("🧑‍🏫 Teacher Agent: Opening Classify...")
        page.goto("http://localhost:5001")

        time.sleep(2)

        # Take initial screenshot
        page.screenshot(path="screenshots/step_01_initial.png")
        print("📸 Took screenshot: step_01_initial.png")

        # Keep browser open so I can interact
        print("\n✋ Browser is open. You can now analyze the screenshot and decide next steps.")
        input("Press Enter to close the browser...")

        browser.close()

if __name__ == "__main__":
    import os
    os.makedirs("screenshots", exist_ok=True)
    run_test()
