"""Browser checks for navigation, uploads, scenarios and real-data rendering.

Synthetic holdings below test calculations; they are never sent to a server.
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from render_previews import browser_session


DATA = {
    "investor": {"name": "Test family"},
    "period": {"from": "2026-01-01", "to": "2026-11-01"},
    "valuation_date": "2026-11-01",
    "schemes": [
        {"name": "Example Small Cap", "amc": "Example", "folio": "TEST1", "owner": "Alex",
         "category": "Equity", "units": 10, "invested": 10000, "current": 12000, "gain": 2000,
         "education": False, "liquid": False, "goalId": None},
        {"name": "Example Mid Cap", "amc": "Example", "folio": "TEST2", "owner": "Sam",
         "category": "Equity", "units": 5, "invested": 5000, "current": 4000, "gain": -1000,
         "education": False, "liquid": False, "goalId": None},
        {"name": "Education Fund", "amc": "Example", "folio": "TEST3", "owner": "Alex",
         "category": "Equity", "units": 2, "invested": 2000, "current": 2200, "gain": 200,
         "education": True, "liquid": False, "goalId": "engineering"},
        {"name": "Cash Reserve", "amc": "Example", "folio": "TEST4", "owner": "Alex",
         "category": "Liquid", "units": 1, "invested": 1000, "current": 1100, "gain": 100,
         "education": False, "liquid": True, "goalId": None},
    ],
    "total_invested": 18000, "total_current": 19300, "total_gain": 1300,
    "owners": ["Alex", "Sam"], "category_values": {}, "amc_values": {},
}


def main():
    with browser_session() as (browser, origin):
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        errors, failed = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: failed.append(response.url) if response.status >= 400 else None)
        for width in (1440, 390):
            page.set_viewport_size({"width": width, "height": 1000})
            for name in ("index", "upload", "total-assets", "portfolio", "aditya", "retirement"):
                page.goto(f"{origin}/{name}.html", wait_until="networkidle")
                assert page.locator("h1").count() >= 1, name
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{name}: overflow at {width}"
        assert not errors, errors
        assert not failed, f"Missing assets: {failed}"
        print("PASS: six pages, local assets, desktop/mobile layout, no JavaScript errors")

        page.goto(f"{origin}/upload.html")
        page.locator('button[type="submit"]').click()
        assert page.locator("#formResult").inner_text().strip(), "Empty upload has no validation"
        page.locator("#pdfPassword").fill("synthetic-password")
        page.locator("#togglePassword").click()
        assert page.locator("#pdfPassword").get_attribute("type") == "text"
        page.locator("#togglePassword").click()
        assert page.locator("#pdfPassword").get_attribute("type") == "password"
        pdf_check = page.evaluate("""async () => {
            const pdf = await import('./js/vendor/pdf.mjs');
            const parser = await import('./js/vendor/casparser.mjs');
            return {pdf: typeof pdf.getDocument, read: typeof parser.readCasPdf,
                    backend: typeof parser.createPdfjsBackend};
        }""")
        assert set(pdf_check.values()) == {"function"}, pdf_check
        invalid = page.evaluate("""async () => {
            try {
                await WealthData.parseFiles([new File(['not a PDF'], 'invalid.pdf', {type:'application/pdf'})], '');
                return false;
            } catch (error) { return Boolean(error.message); }
        }""")
        assert invalid, "Invalid PDF was accepted"
        print("PASS: upload validation, password toggle, local parser import and invalid-PDF rejection")

        page.goto(f"{origin}/retirement.html")
        before = page.locator("#projectedCorpus").inner_text()
        page.locator('[data-return="12"]').click()
        assert page.locator('[data-return="12"]').get_attribute("aria-pressed") == "true"
        assert page.locator("#projectedCorpus").inner_text() != before
        assert page.locator("#projectionLine").get_attribute("d"), "No projected chart"
        projection = page.evaluate("""() => WealthPlanner.project({
            currentAge:30, retirementAge:31, horizon:33, corpus:1000,
            monthlyExpense:10, inflation:0, expectedReturn:0
        })""")
        assert projection["retirementCorpus"] == 1000 and projection["finalCorpus"] == 760, projection
        page.get_by_role("button", name="Edit assumptions").click()
        dialog = page.locator("dialog")
        dialog.locator('[name="retirementAge"]').fill("20")
        dialog.get_by_role("button", name="Update projection").click()
        assert dialog.is_visible(), "Invalid ages accepted"
        dialog.locator('[name="retirementAge"]').fill("45")
        dialog.locator('[name="corpus"]').fill("1000000")
        corpus_before = page.locator("#projectedCorpus").inner_text()
        dialog.get_by_role("button", name="Update projection").click()
        assert not dialog.is_visible()
        assert page.locator("#projectedCorpus").inner_text() != corpus_before
        print("PASS: retirement scenarios, withdrawal arithmetic and editable assumptions validation")

        page.goto(f"{origin}/aditya.html")
        page.locator('[data-goal="Coaching"]').click()
        assert page.locator('[data-goal="Coaching"]').get_attribute("aria-pressed") == "true"
        assert "Coaching" in page.locator("#goalDetail").inner_text()
        print("PASS: goal selection updates accessible selection and detail")

        page.evaluate("""data => {
            // Use runtime configuration without checking private folio numbers
            // into the test fixture.
            const goal = WealthData.config.education.goals.find(g => g.id === 'engineering');
            data.schemes[2].folio = goal.folios[0];
            data.schemes[3].folio = WealthData.config.liquid.folios[0];
            data.password = 'never-store-this';
            data.rawPdf = 'never-store-raw-pdf';
            WealthData.save(data);
        }""", DATA)
        page.goto(f"{origin}/total-assets.html")
        summary = page.locator(".asset-summary").inner_text()
        assert "₹18,200" in summary and "₹17,000" in summary, summary
        page.goto(f"{origin}/portfolio.html")
        assert "₹16,000" in page.locator(".portfolio-top").inner_text()
        assert "Cash Reserve" not in page.locator("main").inner_text()
        assert "Education Fund" not in page.locator("main").inner_text()
        assert "Alex" in page.locator("main").inner_text() and "Sam" in page.locator("main").inner_text()
        page.goto(f"{origin}/aditya.html")
        assert "₹2,200" in page.locator(".aditya-kpis").inner_text()
        page.locator('[data-goal="Engineering"]').click()
        assert "Education Fund" in page.locator(".people-grid").inner_text()
        page.locator('[data-goal="Coaching"]').click()
        assert "Education Fund" not in page.locator(".people-grid").inner_text()
        assert "synthetic-password" not in page.evaluate("JSON.stringify(sessionStorage)")
        assert "never-store" not in page.evaluate("JSON.stringify(sessionStorage)")
        page.evaluate("WealthData.clear()")
        assert page.evaluate("WealthData.load()") is None
        assert not errors, errors
        print("PASS: saved synthetic CAS navigation, correct totals, education/liquid separation, goal filtering and clear")
        context.close()


if __name__ == "__main__":
    main()
