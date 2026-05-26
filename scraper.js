require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const TARGET_URLS = [...new Set([
    // Glints IT/KOMPUTER (Sumut & Sumbar)
    "https://glints.com/id/opportunities/jobs/explore?keyword=IT&country=ID&locationId=ce7eb5cb-583a-40b2-b12b-0e17f59469e6&locationName=Sumatera+Utara&lowestLocationLevel=2&sortBy=LATEST",
    "https://glints.com/id/opportunities/jobs/explore?keyword=IT&country=ID&locationId=16cbbddf-c3fe-4ca5-a8ff-08ae52c9f085&locationName=Sumatera+Barat&lowestLocationLevel=2&sortBy=LATEST",
    "https://glints.com/id/opportunities/jobs/explore?keyword=KOMPUTER&country=ID&locationId=ce7eb5cb-583a-40b2-b12b-0e17f59469e6&locationName=Sumatera+Utara&lowestLocationLevel=2&sortBy=LATEST",
    // JobStreet IT (Sumut & Sumbar)
    "https://id.jobstreet.com/id/IT-jobs/in-Medan-Sumatera-Utara?sortmode=ListedDate&tags=new",
    "https://id.jobstreet.com/id/IT-jobs/in-Sumatera-Barat?sortmode=ListedDate&tags=new",
    "https://id.jobstreet.com/id/IT-jobs-in-information-communication-technology/in-Sumatera-Utara?sortmode=ListedDate"
])];

const BLACKLIST_COMPANIES = ["PT ALFA SCORPII", "ALFA SCORPII"];

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_NOTIFICATIONS_PER_RUN = 1000; // Increased to ensure no jobs are missed
// Default aktif agar setiap loker ada gambar preview.
const ENABLE_DETAIL_ENRICHMENT = (process.env.ENABLE_DETAIL_ENRICHMENT || 'true').toLowerCase() !== 'false';
const SCREENSHOT_VIEWPORT = { width: 1440, height: 2200 };
const SCREENSHOT_PADDING = 20;
const parsedScreenshotMaxHeight = Number.parseInt(process.env.SCREENSHOT_MAX_HEIGHT || '4200', 10);
const SCREENSHOT_MAX_HEIGHT = Number.isFinite(parsedScreenshotMaxHeight) && parsedScreenshotMaxHeight > 1000
    ? parsedScreenshotMaxHeight
    : 4200;
const SCREENSHOT_TARGET_SELECTORS = [
    '[data-automation="jobDescription"]',
    '[data-automation="job-details-page"]',
    '[data-automation="jobDetailsPage"]',
    'section[data-automation*="job"]',
    'div[class*="JobDescription"]',
    '.job-description',
    '.entry-content',
    '.post-content',
    'article',
    'main'
];

// Helper to check freshness:
// - return false only when the posting is explicitly old
// - return true when posting is clearly new or date format is unknown (to avoid missing latest jobs)
function isFresh(text) {
    if (!text) return true;
    const lower = text.toLowerCase();

    // "Baru saja", "menit yang lalu", "jam yang lalu" -> Always fresh
    if (
        lower.includes("baru saja") ||
        lower.includes("baru di posting") ||
        lower.includes("baru diposting") ||
        lower.includes("menit") ||
        lower.includes("jam") ||
        lower.includes("just now") ||
        lower.includes("minutes") ||
        lower.includes("hours")
    ) {
        return true;
    }

    // Check for short format like "2h ago", "10m ago"
    if (lower.match(/\d+\s*(h|m)\b\s*ago/)) {
        return true;
    }

    // Check days
    // Matches "1 hari", "2 days", "3 hari yang lalu", "2d ago", etc.
    const dayMatch = lower.match(/(\d+)\s*(hari|days?|d\s*ago)/);
    if (dayMatch) {
        const days = parseInt(dayMatch[1]);
        return days <= 2; // Keep recent jobs up to 2 days to reduce misses
    }

    // "minggu" or "bulan" -> Old
    if (lower.includes("minggu") || lower.includes("week") || lower.includes("bulan") || lower.includes("month") || lower.match(/\d+\s*(w|mo)\b\s*ago/)) {
        return false;
    }

    return true; // Unknown format: keep to avoid missing potentially fresh jobs
}

async function sendFonnteMessage(message) {
    const url = "https://api.fonnte.com/send";
    try {
        const response = await axios.post(url, {
            target: process.env.WHATSAPP_TARGET, // Target WhatsApp Number
            message: message,
        }, {
            headers: {
                "Authorization": process.env.FONNTE_TOKEN
            }
        });
        console.log("WhatsApp message sent via Fonnte:", response.data.status);
    } catch (error) {
        console.error("Failed to send WhatsApp message:", error.message);
    }
}

function getTelegramConfig() {
    const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

    if (!botToken || botToken === 'your_telegram_bot_token_here') {
        console.error('Telegram config invalid: TELEGRAM_BOT_TOKEN belum diisi dengan token bot yang valid.');
        return null;
    }

    if (!chatId || chatId === 'your_telegram_chat_id_here') {
        console.error('Telegram config invalid: TELEGRAM_CHAT_ID belum diisi. Chat dulu bot kamu lalu ambil chat_id dari getUpdates.');
        return null;
    }

    return { botToken, chatId };
}

async function sendTelegramMessage(message) {
    const telegramConfig = getTelegramConfig();
    if (!telegramConfig) return false;

    const { botToken, chatId } = telegramConfig;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        const response = await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });

        console.log("Telegram message sent:", response.data.ok);
        return true;
    } catch (error) {
        const errorDescription = error.response?.data?.description || error.message;
        console.error("Failed to send Telegram message:", errorDescription);
        return false;
    }
}

async function sendTelegramPhoto(imagePath, caption) {
    const telegramConfig = getTelegramConfig();
    if (!telegramConfig) return false;

    const { botToken, chatId } = telegramConfig;
    
    try {
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
        
        const fileBuffer = fs.readFileSync(imagePath);
        const blob = new Blob([fileBuffer]);
        formData.append('photo', blob, 'screenshot.png');
        
        const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        const response = await fetch(url, { method: 'POST', body: formData });
        const data = await response.json();

        if (!response.ok || !data.ok) {
            console.error("Failed to send Telegram photo:", data.description || `HTTP ${response.status}`);
            return false;
        }

        console.log("Telegram photo sent:", data.ok);
        return true;
    } catch (error) {
        console.error("Failed to send Telegram photo:", error.message);
        return false;
    }
}

// Send notification to all configured channels
async function sendNotification(message) {
    await sendTelegramMessage(message);

    // Send to WhatsApp if configured
    if (process.env.FONNTE_TOKEN && process.env.FONNTE_TOKEN !== 'your_fonnte_token_here') {
        await sendFonnteMessage(message);
    }
}

const fs = require('fs');
const HISTORY_FILE = 'processed_jobs.json';

function normalizeUniqueId(value = '') {
    return String(value).toLowerCase().trim().replace(/\s+/g, ' ');
}

function buildUniqueId(job) {
    const normalizedTitle = normalizeUniqueId(job.title);
    const normalizedCompany = normalizeUniqueId(job.company);
    const normalizedLink = normalizeUniqueId((job.link || '').split('#')[0].replace(/\/$/, ''));
    return normalizedLink || `${normalizedTitle}-${normalizedCompany}`;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function hideCommonOverlays(page) {
    await page.evaluate(() => {
        const overlaySelectors = [
            '[id*="cookie"]',
            '[class*="cookie"]',
            '[id*="consent"]',
            '[class*="consent"]',
            '[class*="popup"]',
            '[class*="modal"]',
            '[class*="overlay"]',
            '[class*="intercom"]',
            '[class*="chat"]',
            'iframe[title*="chat"]'
        ];

        for (const selector of overlaySelectors) {
            const nodes = document.querySelectorAll(selector);
            nodes.forEach((node) => {
                node.style.setProperty('display', 'none', 'important');
                node.style.setProperty('visibility', 'hidden', 'important');
            });
        }

        const fixedElements = Array.from(document.querySelectorAll('body *')).filter((node) => {
            const style = window.getComputedStyle(node);
            if (!style) return false;
            if (style.position !== 'fixed' && style.position !== 'sticky') return false;
            const rect = node.getBoundingClientRect();
            const likelyFloatingBar = rect.height > 0 && rect.height < window.innerHeight * 0.35;
            return likelyFloatingBar && rect.width > window.innerWidth * 0.5;
        });

        fixedElements.forEach((node) => {
            node.style.setProperty('display', 'none', 'important');
            node.style.setProperty('visibility', 'hidden', 'important');
        });
    });
}

async function findBestScreenshotElement(page) {
    const maxCandidatesPerSelector = 5;

    for (const selector of SCREENSHOT_TARGET_SELECTORS) {
        const handles = await page.$$(selector);
        if (!handles.length) continue;

        const limitedHandles = handles.slice(0, maxCandidatesPerSelector);
        let bestHandle = null;
        let bestArea = 0;

        for (const handle of limitedHandles) {
            const meta = await handle.evaluate((el) => {
                const style = window.getComputedStyle(el);
                if (!style || style.display === 'none' || style.visibility === 'hidden') return null;

                const rect = el.getBoundingClientRect();
                const textLength = (el.innerText || '').trim().length;
                if (rect.width < 260 || rect.height < 140 || textLength < 40) return null;

                return {
                    area: rect.width * rect.height
                };
            });

            if (!meta) {
                await handle.dispose();
                continue;
            }

            if (meta.area > bestArea) {
                if (bestHandle) await bestHandle.dispose();
                bestHandle = handle;
                bestArea = meta.area;
            } else {
                await handle.dispose();
            }
        }

        // Dispose remaining handles not used to avoid leaking references.
        for (const handle of handles) {
            if (bestHandle !== handle) {
                try {
                    await handle.dispose();
                } catch {
                    // Ignore dispose errors.
                }
            }
        }

        if (bestHandle) {
            return bestHandle;
        }
    }

    return null;
}

async function capturePreciseJobScreenshot(page, imgPath) {
    await hideCommonOverlays(page);
    const targetElement = await findBestScreenshotElement(page);

    if (targetElement) {
        try {
            await targetElement.scrollIntoView();
            await delay(600);

            const box = await targetElement.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
                const clip = {
                    x: Math.max(0, box.x - SCREENSHOT_PADDING),
                    y: Math.max(0, box.y - SCREENSHOT_PADDING),
                    width: Math.max(1, box.width + (SCREENSHOT_PADDING * 2)),
                    height: Math.max(1, Math.min(box.height + (SCREENSHOT_PADDING * 2), SCREENSHOT_MAX_HEIGHT))
                };

                await page.screenshot({
                    path: imgPath,
                    clip,
                    type: 'png'
                });
                return true;
            }
        } finally {
            await targetElement.dispose();
        }
    }

    await page.screenshot({ path: imgPath, type: 'png' });
    return false;
}

async function captureFallbackJobCard(browser, job, imgPath) {
    let fallbackPage = null;
    try {
        fallbackPage = await browser.newPage();
        await fallbackPage.setViewport({ width: 1300, height: 900 });

        const safeTitle = escapeHtml(job.title || 'Lowongan Baru');
        const safeCompany = escapeHtml(job.company || '-');
        const safeLink = escapeHtml(job.link || '-');

        await fallbackPage.setContent(`
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
    body {
        margin: 0;
        padding: 40px;
        background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
        font-family: Arial, sans-serif;
    }
    .card {
        width: 1180px;
        background: #ffffff;
        border-radius: 16px;
        padding: 28px 32px;
        box-sizing: border-box;
        border: 1px solid #e5e7eb;
        box-shadow: 0 18px 40px rgba(2, 6, 23, 0.10);
    }
    .badge {
        display: inline-block;
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        background: #dbeafe;
    }
    .title {
        margin-top: 18px;
        margin-bottom: 16px;
        font-size: 38px;
        line-height: 1.25;
        font-weight: 700;
        color: #0f172a;
    }
    .meta {
        font-size: 26px;
        line-height: 1.35;
        color: #1f2937;
        margin-bottom: 22px;
    }
    .link {
        font-size: 20px;
        line-height: 1.45;
        color: #2563eb;
        word-break: break-all;
    }
</style>
</head>
<body>
    <div class="card" id="job-card">
        <div class="badge">LOKER IT / KOMPUTER</div>
        <div class="title">${safeTitle}</div>
        <div class="meta">${safeCompany}</div>
        <div class="link">${safeLink}</div>
    </div>
</body>
</html>`, { waitUntil: 'domcontentloaded' });

        const card = await fallbackPage.$('#job-card');
        if (card) {
            await card.screenshot({ path: imgPath, type: 'png' });
        } else {
            await fallbackPage.screenshot({ path: imgPath, type: 'png' });
        }
        return true;
    } catch (error) {
        console.log(`Fallback screenshot failed for ${job.title}: ${error.message}`);
        return false;
    } finally {
        if (fallbackPage) {
            await fallbackPage.close();
        }
    }
}

(async () => {
    console.log("Starting Scraper...");
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Use CI path or default
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let processedJobs = new Map(); // Map<id, {id, title, company, firstSeen, lastSeen, seenCount, lastNotified}>

    // Load history (backward compatible with old string array format)
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const json = JSON.parse(data);
            for (const item of json) {
                if (typeof item === 'string') {
                    // Old format: just a string ID
                    const id = item.toLowerCase().trim();
                    processedJobs.set(id, {
                        id,
                        title: '',
                        company: '',
                        firstSeen: new Date().toISOString(),
                        lastSeen: new Date().toISOString(),
                        seenCount: 1,
                        lastNotified: new Date().toISOString()
                    });
                } else if (item && item.id) {
                    // New format: object with metadata
                    processedJobs.set(item.id, item);
                }
            }
            console.log(`Loaded ${processedJobs.size} processed jobs from history.`);
        } catch (e) {
            console.error("Error reading history file:", e.message);
        }
    }

    try {
        const page = await browser.newPage();
        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        let allNewJobsToNotify = [];

        for (const url of TARGET_URLS) {
            console.log(`Scraping: ${url}`);
            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                await delay(2000); // Wait for content to settle

                let jobs = [];

                if (url.includes('glints.com')) {
                    // --- GLINTS SCRAPING LOGIC ---
                    console.log("Detected Glints URL");
                    // Scroll down to trigger lazy loading
                    await page.evaluate(async () => {
                        await new Promise((resolve) => {
                            let totalHeight = 0;
                            const distance = 100;
                            const timer = setInterval(() => {
                                const scrollHeight = document.body.scrollHeight;
                                window.scrollBy(0, distance);
                                totalHeight += distance;

                                if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 5000) { // Limit scroll
                                    clearInterval(timer);
                                    resolve();
                                }
                            }, 100);
                        });
                    });

                    await delay(2000);

                    // Extract Job Cards
                    jobs = await page.evaluate(() => {
                        const extracted = [];
                        // Primary anchor: Job Title Link
                        const jobLinks = document.querySelectorAll('a[href*="/opportunities/jobs/"]');

                        jobLinks.forEach(link => {
                            let container = link.closest('div[class*="JobCard"]');
                            if (!container) {
                                container = link.parentElement?.parentElement?.parentElement?.parentElement;
                            }

                            if (!container) return;

                            const companyEl = container.querySelector('a[href*="/companies/"]');
                            let companyName = '';
                            
                            // Primary: get full text from company link
                            if (companyEl) {
                                companyName = companyEl.textContent.trim();
                            }
                            
                            // Fallback: search all text nodes for something that looks like a company name
                            if (!companyName || companyName.length < 3) {
                                const allText = container.querySelectorAll('span, div, p, a');
                                for (const el of allText) {
                                    const txt = el.textContent.trim();
                                    // Skip the job title itself, dates, locations, salary
                                    if (txt === link.textContent.trim()) continue;
                                    if (txt.length < 3 || txt.length > 120) continue;
                                    if (/^\d|ago|lalu|hari|jam|menit|Rp|IDR|Gaji|tahun|bulan/i.test(txt)) continue;
                                    // Look for company-like patterns: PT, CV, multi-word capitalized, etc.
                                    if (/^(PT|CV|UD|Yayasan|Koperasi)\b/i.test(txt) || 
                                        (txt.split(' ').length >= 2 && /^[A-Z]/.test(txt) && el.children.length === 0)) {
                                        companyName = txt;
                                        break;
                                    }
                                }
                            }
                            
                            // Last resort fallback
                            if (!companyName || companyName.length < 3) {
                                const lines = container.innerText.split('\n').filter(l => l.trim().length > 3);
                                // Skip first line (usually title), pick next substantial line
                                for (let i = 1; i < lines.length; i++) {
                                    const line = lines[i].trim();
                                    if (line === link.textContent.trim()) continue;
                                    if (/^\d|ago|lalu|hari|jam|menit|Rp|IDR/i.test(line)) continue;
                                    if (line.length >= 3 && line.length <= 100) {
                                        companyName = line;
                                        break;
                                    }
                                }
                            }
                            
                            if (!companyName) companyName = "Unknown Company";

                            if (link && companyName) {
                                extracted.push({
                                    title: link.innerText,
                                    company: companyName,
                                    link: link.href,
                                    details: container.innerText
                                });
                            }
                        });

                        // Filter duplicates
                        const unique = [];
                        const seen = new Set();
                        extracted.forEach(item => {
                            if (!seen.has(item.link)) {
                                seen.add(item.link);
                                unique.push(item);
                            }
                        });
                        return unique;
                    });

                } else if (url.includes('jobstreet')) {
                    // --- JOBSTREET SCRAPING LOGIC ---
                    console.log("Detected JobStreet URL");

                    // JobStreet Infinite Scroll (Simple)
                    await page.evaluate(async () => {
                        await new Promise((resolve) => {
                            let totalHeight = 0;
                            const distance = 300;
                            let retries = 0;
                            const timer = setInterval(() => {
                                const scrollHeight = document.body.scrollHeight;
                                window.scrollBy(0, distance);
                                totalHeight += distance;

                                if (totalHeight >= scrollHeight || totalHeight > 10000) {
                                    clearInterval(timer);
                                    resolve();
                                }
                            }, 200);
                        });
                    });

                    await delay(3000);

                    jobs = await page.evaluate(() => {
                        const extracted = [];
                        // JobStreet uses <article> for job cards usually
                        const articles = document.querySelectorAll('article');

                        articles.forEach(article => {
                            const titleEl = article.querySelector('[data-automation="jobTitle"]');
                            const companyEl = article.querySelector('[data-automation="jobCompany"]');
                            const dateEl = article.querySelector('[data-automation="jobListingDate"]');
                            const locationEl = article.querySelector('[data-automation="jobLocation"]');
                            const linkEl = article.querySelector('a[data-automation="jobTitle"]') || article.querySelector('a[href*="/job/"]');

                            if (titleEl && linkEl) {
                                extracted.push({
                                    title: titleEl.innerText,
                                    company: companyEl ? companyEl.innerText : "Unknown Info",
                                    link: linkEl.href,
                                    // Combine text for context
                                    details: `${titleEl.innerText}\n${companyEl ? companyEl.innerText : ''}\n${locationEl ? locationEl.innerText : ''}\n${dateEl ? dateEl.innerText : ''}`
                                });
                            }
                        });

                        // Fallback extractor when JobStreet layout changes and no <article> data found
                        if (extracted.length === 0) {
                            const normalize = (value = "") => value.replace(/\s+/g, ' ').trim();
                            const fallbackLinks = Array.from(document.querySelectorAll('a[data-automation="jobTitle"], a[href*="/job/"]'));
                            const seenFallback = new Set();

                            fallbackLinks.forEach(linkEl => {
                                const href = linkEl.href || linkEl.getAttribute('href') || '';
                                const title = normalize(linkEl.innerText || linkEl.textContent || "");
                                if (!href || !title || title.length < 4) return;
                                if (seenFallback.has(href)) return;
                                seenFallback.add(href);

                                const container = linkEl.closest('article, li, div');
                                const containerText = container ? (container.innerText || '') : '';
                                const rawLines = containerText.split('\n').map(line => normalize(line)).filter(Boolean);
                                const company = rawLines.find(line =>
                                    line !== title &&
                                    line.length >= 3 &&
                                    !/^\d+/.test(line) &&
                                    !/hari|day|jam|hour|menit|minute|listed|new|gaji|salary|lokasi|location/i.test(line)
                                ) || "Unknown Info";

                                extracted.push({
                                    title,
                                    company,
                                    link: href,
                                    details: rawLines.join('\n') || title
                                });
                            });
                        }

                        // Filter duplicates
                        const unique = [];
                        const seen = new Set();
                        extracted.forEach(item => {
                            if (!seen.has(item.link)) {
                                seen.add(item.link);
                                unique.push(item);
                            }
                        });
                        return unique;
                    });
                } else if (url.includes('lokermedan.co.id')) {
                    // --- LOKERMEDAN SCRAPING LOGIC ---
                    console.log("Detected LokerMedan URL");
                    await delay(3000);

                    jobs = await page.evaluate(() => {
                        const extracted = [];
                        const links = Array.from(document.querySelectorAll('a'))
                            .map(a => a.getAttribute('href')) // Get raw href, not absolute yet
                            .filter(href => href && href.includes('-loker-') && href.endsWith('.html') && !href.includes('whatsapp.com'));

                        // Use a Set to avoid processing same relative link twice
                        const uniqueHrefs = [...new Set(links)];

                        uniqueHrefs.forEach(href => {
                            // Find an anchor element that matches this href to extract title/details
                            const linkEl = document.querySelector(`a[href="${href}"]`);
                            if (!linkEl) return;

                            const title = linkEl.innerText.trim() || linkEl.title || "Unknown";

                            // Make URL absolute
                            const absoluteUrl = href.startsWith('http') ? href : `https://lokermedan.co.id/${href.replace('../', '').replace('./', '')}`;

                            if (title.length > 5 && title.toLowerCase() !== "selengkapnya" && title.toLowerCase() !== "apply") {
                                let details = "";
                                const container = linkEl.closest('.job-item, .card, .post, article, div[class*="item"], div[class*="col-"]');
                                if (container) {
                                    details = container.innerText.trim();
                                }

                                // Try to extract company from title "Loker [Title] [Company] ..."
                                let company = "LokerMedan";
                                const titleParts = title.split('-');
                                if (titleParts.length > 1) {
                                    company = titleParts[titleParts.length - 1].trim(); // Usually company or location is at the end
                                }

                                extracted.push({
                                    title: title,
                                    company: company,
                                    link: absoluteUrl,
                                    details: details || title
                                });
                            }
                        });

                        // Filter duplicates
                        const unique = [];
                        const seen = new Set();
                        extracted.forEach(item => {
                            if (!seen.has(item.link)) {
                                seen.add(item.link);
                                unique.push(item);
                            }
                        });
                        return unique;
                    });
                } else if (url.includes('pintarnya.com')) {
                    // --- PINTARNYA SCRAPING LOGIC ---
                    console.log("Detected Pintarnya URL");
                    await delay(4000);

                    jobs = await page.evaluate(() => {
                        const extracted = [];
                        const normalize = (value = "") => value.replace(/\s+/g, ' ').trim();
                        const jobLinks = Array.from(document.querySelectorAll('a[href*="/lowongan/"]'));

                        jobLinks.forEach(linkEl => {
                            const href = linkEl.getAttribute('href');
                            if (!href || !href.includes('/lowongan/')) return;

                            const rawText = (linkEl.innerText || "").trim();
                            if (!rawText || rawText.length < 5) return;

                            const lines = rawText
                                .split('\n')
                                .map(line => normalize(line))
                                .filter(Boolean);

                            const title = lines[0] || normalize(linkEl.getAttribute('aria-label') || "");
                            if (!title || title.length < 3) return;

                            const ignoredLinePattern = /(hari yang lalu|jam yang lalu|menit yang lalu|baru di posting|baru diposting|kota |kab\.|provinsi|rp\s?[\d\.]|sma\/smk|diploma|s1|s2|s3|org dibutuhkan|full-time|part-time|onsite|hybrid|remote|tidak ada minimal)/i;

                            let company = lines
                                .slice(1)
                                .find(line => /^(PT|CV|UD|Yayasan|Koperasi)\b/i.test(line)) || "";

                            if (!company) {
                                company = lines
                                    .slice(1)
                                    .find(line => !ignoredLinePattern.test(line) && line.length >= 3 && line.length <= 100) || "Pintarnya";
                            }

                            const absoluteUrl = href.startsWith('http')
                                ? href
                                : `https://pintarnya.com${href.startsWith('/') ? '' : '/'}${href}`;

                            extracted.push({
                                title: title,
                                company: company,
                                link: absoluteUrl,
                                details: lines.join('\n')
                            });
                        });

                        // Filter duplicates by link
                        const unique = [];
                        const seen = new Set();
                        extracted.forEach(item => {
                            if (!seen.has(item.link)) {
                                seen.add(item.link);
                                unique.push(item);
                            }
                        });
                        return unique;
                    });
                } else if (url.includes('loker.id')) {
                    // --- LOKER.ID SCRAPING LOGIC ---
                    console.log("Detected Loker.id URL");
                    await delay(3000);

                    jobs = await page.evaluate(() => {
                        const extracted = [];
                        // Loker.id job links end with .html and contain category paths
                        const allLinks = Array.from(document.querySelectorAll('a[href$=".html"]'));

                        const jobLinks = allLinks.filter(a => {
                            const href = a.getAttribute('href') || '';
                            // Job detail links have pattern: /category/subcategory/job-title-company-city.html
                            const parts = href.replace(/^\//, '').split('/');
                            return parts.length >= 3 && href.endsWith('.html') && !href.includes('tentang-kami') && !href.includes('kebijakan');
                        });

                        const uniqueHrefs = [...new Set(jobLinks.map(a => a.getAttribute('href')))];

                        uniqueHrefs.forEach(href => {
                            const linkEl = document.querySelector(`a[href="${href}"]`);
                            if (!linkEl) return;

                            const title = linkEl.innerText.trim() || linkEl.title || "Unknown";
                            if (title.length <= 3 || title.toLowerCase() === 'rincian' || title.toLowerCase() === 'selengkapnya') return;

                            // Make URL absolute
                            const absoluteUrl = href.startsWith('http') ? href : `https://www.loker.id${href.startsWith('/') ? '' : '/'}${href}`;

                            // Extract company from container text or title
                            let company = "";
                            const container = linkEl.closest('.card, .job-item, article, div[class*="item"], div[class*="col"], div[class*="list"], tr, li');
                            
                            // Strategy 1: Look for company name in container text (often has PT/CV prefix)
                            if (container) {
                                const containerText = container.innerText || '';
                                const lines = containerText.split('\n').filter(l => l.trim().length > 3);
                                for (const line of lines) {
                                    const trimmed = line.trim();
                                    if (trimmed === title) continue; // skip title
                                    if (/^(PT|CV|UD|Yayasan)\b/i.test(trimmed)) {
                                        company = trimmed;
                                        break;
                                    }
                                }
                                // If no PT/CV found, look for any line that looks like a company
                                if (!company) {
                                    for (const line of lines) {
                                        const trimmed = line.trim();
                                        if (trimmed === title) continue;
                                        if (trimmed.length < 4 || trimmed.length > 100) continue;
                                        if (/lokasi|gaji|apply|selengkap|rincian|^\d/i.test(trimmed)) continue;
                                        // Multi-word, starts with capital = likely company
                                        if (trimmed.split(' ').length >= 2 && /^[A-Z]/.test(trimmed)) {
                                            company = trimmed;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            // Strategy 2: Extract from URL slug as fallback
                            if (!company) {
                                const slug = href.split('/').pop().replace('.html', '');
                                // Loker.id slugs: job-title-pt-company-name-city
                                const ptMatch = slug.match(/-(pt|cv|ud)-(.+?)-(medan|sumatera|indonesia|jakarta|bandung)/i);
                                if (ptMatch) {
                                    company = (ptMatch[1] + ' ' + ptMatch[2]).replace(/-/g, ' ');
                                    company = company.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                } else {
                                    // Fallback: use everything after the last known title word
                                    company = "Loker.id";
                                }
                            }

                            // Try to get details from parent container
                            let details = "";
                            if (container) {
                                details = container.innerText.trim();
                            }

                            extracted.push({
                                title: title,
                                company: company,
                                link: absoluteUrl,
                                details: details || title
                            });
                        });

                        // Filter duplicates
                        const unique = [];
                        const seen = new Set();
                        extracted.forEach(item => {
                            if (!seen.has(item.link)) {
                                seen.add(item.link);
                                unique.push(item);
                            }
                        });
                        return unique;
                    });
                }

                if (jobs.length === 0) {
                    console.log(`No jobs found on ${url}`);
                }

                console.log(`Found ${jobs.length} jobs on this page.`);

                for (const job of jobs) {
                    if (allNewJobsToNotify.length >= MAX_NOTIFICATIONS_PER_RUN) {
                        console.log(`Reached MAX_NOTIFICATIONS_PER_RUN (${MAX_NOTIFICATIONS_PER_RUN}). Stopping scrape loop.`);
                        break;
                    }

                    const uniqueId = buildUniqueId(job);
                    const now = new Date();
                    const existingJob = processedJobs.get(uniqueId);

                    if (existingJob) {
                        // Job sudah pernah diproses — update lastSeen saja (tidak kirim notifikasi lagi)
                        existingJob.lastSeen = now.toISOString();
                        existingJob.seenCount += 1;
                        console.log(`Skipped (Duplicate/Repost): ${job.title} at ${job.company}`);
                        continue;
                    } else {
                        // Job baru — proses seperti biasa

                        // 0. DATE Filter
                        if (!isFresh(job.details) && !job.link.includes('lokermedan.co.id') && !job.link.includes('loker.id')) {
                            console.log(`Skipped (Old/No Date): ${job.title} - ${job.company}`);
                            continue;
                        }

                        // 1. Hard Filter
                        if (BLACKLIST_COMPANIES.some(b => job.company.toUpperCase().includes(b))) {
                            console.log(`Skipped (Blacklisted): ${job.company}`);
                            continue;
                        }

                        // Simpan ke history sebagai job baru
                        processedJobs.set(uniqueId, {
                            id: uniqueId,
                            title: job.title.trim(),
                            company: job.company.trim(),
                            firstSeen: now.toISOString(),
                            lastSeen: now.toISOString(),
                            seenCount: 1,
                            lastNotified: now.toISOString()
                        });

                        // Semua URL sudah khusus IT/KOMPUTER. Tandai sebagai target agar tidak ada lowongan baru terlewat.
                        job.isTargetJob = true;

                        allNewJobsToNotify.push(job);
                        console.log(`Added to notification queue: ${job.title} at ${job.company}`);
                    }
                }

                if (allNewJobsToNotify.length >= MAX_NOTIFICATIONS_PER_RUN) {
                    break;
                }

            } catch (err) {
                console.error(`Error scraping ${url}:`, err.message);
            }

            await delay(3000); // Wait between pages
        }

        // --- BATCH SEND ALL NEW JOBS ---
        if (allNewJobsToNotify.length === 0) {
            console.log("No new jobs found in this run. Sending update.");
            await sendNotification("BELUM ADA LOKER FI, KALAU SUDAH DI PANGGIL PERGI SAJA INTERVIEW FI, KALAU GAK. UDAH PASTI KAU GAGAL  ");
        } else {
            if (ENABLE_DETAIL_ENRICHMENT) {
                // --- FETCH FULL JOB DESCRIPTIONS + SCREENSHOTS ---
                console.log(`Capturing detail screenshots for ${allNewJobsToNotify.length} new jobs...`);
                for (let i = 0; i < allNewJobsToNotify.length; i++) {
                    const job = allNewJobsToNotify[i];
                    let detailPage = null;

                    try {
                        detailPage = await browser.newPage();
                        await detailPage.setViewport(SCREENSHOT_VIEWPORT);
                        await detailPage.goto(job.link, { waitUntil: 'networkidle2', timeout: 45000 });
                        await delay(2500); // Give dynamic content time to render

                        // Wait a bit for any known detail container to appear (no hard fail when selector is different)
                        await detailPage.waitForFunction(
                            (selectors) => selectors.some((selector) => document.querySelector(selector)),
                            { timeout: 6000 },
                            SCREENSHOT_TARGET_SELECTORS
                        ).catch(() => null);

                        let fullDescHtml = await detailPage.evaluate(() => {
                            let el = document.querySelector('[data-automation="jobDescription"]');
                            if (el) return el.innerHTML;

                            el = document.querySelector('div[class*="JobDescription"]');
                            if (el) return el.innerHTML;

                            el = document.querySelector('.job-description');
                            if (el) return el.innerHTML;

                            el = document.querySelector('.entry-content');
                            if (!el) el = document.querySelector('.post-content');
                            if (el) return el.innerHTML;

                            return null;
                        });

                        if (fullDescHtml && fullDescHtml.trim().length > 50) {
                            job.details = fullDescHtml.trim();
                        }

                        const imgPath = `screenshot_${Date.now()}_${i}.png`;
                        const usedPreciseElement = await capturePreciseJobScreenshot(detailPage, imgPath);
                        job.screenshotPath = imgPath;
                        if (!usedPreciseElement) {
                            console.log(`Screenshot fallback (viewport): ${job.title}`);
                        }
                    } catch (err) {
                        console.log(`Failed to fetch detail/screenshot for ${job.title}: ${err.message}`);
                    } finally {
                        if (detailPage) {
                            await detailPage.close();
                        }
                    }

                    // Hard guarantee: try local fallback image so each loker can still be sent with a picture.
                    if (!job.screenshotPath || !fs.existsSync(job.screenshotPath)) {
                        const fallbackPath = `screenshot_fallback_${Date.now()}_${i}.png`;
                        const fallbackCreated = await captureFallbackJobCard(browser, job, fallbackPath);
                        if (fallbackCreated && fs.existsSync(fallbackPath)) {
                            job.screenshotPath = fallbackPath;
                        }
                    }
                }
            } else {
                console.log("Detail enrichment disabled by env (ENABLE_DETAIL_ENRICHMENT=false).");
            }

            console.log(`Processing ${allNewJobsToNotify.length} new jobs for Telegram...`);

            // --- SEND TO MEDANKERJA API ---
            try {
                console.log("Sending jobs to MedanKerja API...");
                // Note: Using medankerja.test as Laragon default hostname. Modify if using localhost/medankerja
                const apiUrl = "http://medankerja.test/api/import_jobs.php?token=medanjobs_scraper_secret_2024";
                const apiRes = await axios.post(apiUrl, allNewJobsToNotify);
                console.log("MedanKerja Import Result:", apiRes.data);
            } catch (err) {
                console.error("Failed to send to MedanKerja:", err.message);
            }

            let batchedMessage = "";
            let jobsInBatch = 0;

            for (const job of allNewJobsToNotify) {
                const safeTitle = escapeHtml(job.title);
                const safeCompany = escapeHtml(job.company);
                const safeLink = escapeHtml(job.link);
                const label = job.isTargetJob ? '[LOKER IT / KOMPUTER]' : '[LOKER BARU]';
                const caption = `${label}\n<b>${safeTitle}</b>\n${safeCompany}\n<a href="${safeLink}">Buka Lowongan</a>`;

                if (job.screenshotPath) {
                    await sendTelegramPhoto(job.screenshotPath, caption);
                    await delay(3500); // Wait between photos
                } else {
                    batchedMessage += caption + "\n\n";
                    jobsInBatch++;

                    // Send per 10 jobs
                    if (jobsInBatch >= 10) {
                        batchedMessage += `🔥 <i>#Semangat Arfi, buktikan mereka adalah sampah</i>`;
                        await sendNotification(batchedMessage);
                        batchedMessage = "";
                        jobsInBatch = 0;
                        await delay(3500); // Wait longer between telegram batches to avoid rate limit (429)
                    }
                }
            }

            // Send remaining jobs unbatched
            if (jobsInBatch > 0) {
                batchedMessage += `🔥 <i>#Semangat Arfi</i>`;
                await sendNotification(batchedMessage);
                await delay(2000);
            }

            // Cleanup screenshots
            for (const job of allNewJobsToNotify) {
                if (job.screenshotPath && fs.existsSync(job.screenshotPath)) {
                    fs.unlinkSync(job.screenshotPath);
                }
            }
        }

    } catch (error) {
        console.error("Fatal Error:", error);
        await sendNotification(`⚠️ <b>SCRAPER CRASHED</b>\n\nError: ${error.message}\n\nCheck GitHub Actions logs.`);
    } finally {
        await browser.close();

        // Save history (Limit to last 1000 to prevent infinite growth)
        try {
            const historyArray = Array.from(processedJobs.values()).slice(-1000);
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyArray, null, 2));
            console.log("Updated job history saved.");
        } catch (e) {
            console.error("Error saving history:", e.message);
        }

        console.log("Scraper finished.");
    }
})();

