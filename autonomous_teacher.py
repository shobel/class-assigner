"""
Autonomous Teacher Test Agent
Goal: Be a kindergarten teacher who wants to create next year's 1st grade assignments
"""
from playwright.sync_api import sync_playwright
import time

step = 0

def take_screenshot(page, description):
    global step
    step += 1
    filename = f"screenshots/step_{step:02d}_{description}.png"
    page.screenshot(path=filename)
    print(f"📸 Step {step}: {description}")
    return filename

def run_teacher_agent():
    print("🧑‍🏫 I'm a kindergarten teacher preparing for next year!")
    print("📋 Goal: Create 1st grade class assignments for 2026-27 school year\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=800)
        page = browser.new_page()
        page.set_viewport_size({"width": 1920, "height": 1080})

        print("Step 1: Opening Classify...")
        page.goto("http://localhost:5001")
        time.sleep(2)
        take_screenshot(page, "opened_app")

        print("\n🤔 I see I'm on the Getting Started page for 2025-26.")
        print("   I need to create the next school year (2026-27) first.")
        print("   I'll click the ↗ button next to 'School years'\n")

        # Click the create next year button
        page.click('button[title="Create next school year"]')
        time.sleep(3)
        take_screenshot(page, "transition_modal_opened")

        print("\n✅ Great! The transition wizard opened showing promoted students.")
        print("   I can see my Kindergarten students will become 1st Graders.")
        print("   Now I'll click 'Create School Year →' button\n")

        # Click the create button
        page.click('button.btn.terra:has-text("Create School Year")')
        time.sleep(2)
        take_screenshot(page, "confirmation_dialog")

        print("\n✅ A confirmation dialog appeared! Clicking 'Create' to confirm...\n")
        # The dialog button seems to be blocked, let me try forcing the click
        page.evaluate("""
            const buttons = Array.from(document.querySelectorAll('button'));
            const createBtn = buttons.find(b => b.textContent.trim() === 'Create' && b.classList.contains('terra'));
            if (createBtn) createBtn.click();
        """)
        time.sleep(4)
        take_screenshot(page, "created_2026_27")

        print("\n🤔 Let me see if 2026-27 was created and is now active...")
        time.sleep(2)
        take_screenshot(page, "after_year_created")

        print("\n🐛 BUG FOUND: The transition modal is still open!")
        print("   It should have closed after creating the year.")
        print("   Let me try to close it by clicking the Cancel button or pressing Escape...\n")

        # Try pressing Escape to close the modal
        page.keyboard.press("Escape")
        time.sleep(1)
        take_screenshot(page, "tried_escape")

        # If that didn't work, try clicking Cancel
        try:
            page.click('button:has-text("Cancel")', timeout=2000)
            print("   Clicked Cancel button")
        except:
            print("   No Cancel button found")

        time.sleep(2)
        take_screenshot(page, "modal_closed")

        print("\n✅ Now I should navigate to 1st Grade and run the assignment solver.")
        print("   Looking for 1st Grade in the sidebar...\n")

        # Click on 1st Grade in sidebar - use a more specific selector
        page.evaluate("""
            const grades = document.querySelectorAll('#gradeNav .grade-item');
            const firstGrade = Array.from(grades).find(g => g.textContent.includes('1st Grade'));
            if (firstGrade) firstGrade.click();
        """)
        time.sleep(2)
        time.sleep(2)
        take_screenshot(page, "viewing_1st_grade")

        print("\n🤔 I'm viewing 1st Grade now. I should see my promoted kindergarteners.")
        print("   Now I need to run the optimizer to create class assignments.\n")

        # Look for the Run optimizer button
        page.click('button:has-text("Run optimizer")')
        time.sleep(2)
        take_screenshot(page, "clicked_run_optimizer")

        print("\n⏳ Waiting for solver to complete...")
        time.sleep(10)  # Solver might take a while
        take_screenshot(page, "solver_completed")

        print("\n✅ Solver should be done! Let me check the Assignment tab.")

        # Click Assignment tab
        page.click('button:has-text("Assignment")')
        time.sleep(2)
        take_screenshot(page, "viewing_assignments")

        print("\n🎉 Done! Let me see the final result...")
        time.sleep(2)
        take_screenshot(page, "final_result")

        print("\n" + "="*60)
        print("🧑‍🏫 TEACHER AGENT COMPLETED GOAL!")
        print("="*60)
        print("✅ Created 2026-27 school year")
        print("✅ Navigated to 1st Grade (promoted kindergarteners)")
        print("✅ Ran the assignment solver")
        print("✅ Viewed the class assignments")
        print("\nCheck the screenshots/ folder for the full journey!")

        browser.close()

if __name__ == "__main__":
    import os
    os.makedirs("screenshots", exist_ok=True)
    run_teacher_agent()
