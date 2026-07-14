const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const PAGES_TO_TEST = {
    site: path.join(__dirname, "..", "..", "site-staging", "index.html"),
    dashboard: path.join(__dirname, "..", "..", "web-staging", "dashboard.html")
};

async function testPage(target) {
    const filePath = PAGES_TO_TEST[target];
    if (!fs.existsSync(filePath)) {
        return { target, passed: false, errors: [`File not found: ${filePath}`] };
    }

    const errors = [];
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });
        const page = await browser.newPage();

        page.on("console", (msg) => {
            if (msg.type() === "error") {
                errors.push(`console.error: ${msg.text()}`);
            }
        });
        page.on("pageerror", (err) => {
            errors.push(`pageerror: ${err.message}`);
        });
        page.on("requestfailed", (req) => {
            const url = req.url();
            if (url.startsWith("file://")) {
                errors.push(`requestfailed: ${url}`);
            }
        });

        await page.goto(`file://${filePath}`, { waitUntil: "networkidle0", timeout: 15000 });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        await browser.close();
    } catch (err) {
        if (browser) await browser.close().catch(() => {});
        errors.push(`test runner failure: ${err.message}`);
    }

    return { target, passed: errors.length === 0, errors };
}

async function runAutomatedTests(supabase) {
    const results = [];

    for (const target of Object.keys(PAGES_TO_TEST)) {
        const result = await testPage(target);
        results.push(result);

        await supabase.from("audit_log").insert({
            event_type: result.passed ? "auto_test_passed" : "auto_test_failed",
            payload: { target: result.target, errors: result.errors }
        });
    }

    return results;
}

module.exports = { runAutomatedTests };
