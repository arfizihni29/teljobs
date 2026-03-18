require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const TARGET_URLS = [
    // Social Media
    "https://glints.com/id/opportunities/jobs/explore?keyword=social+media&country=ID&locationId=a6f7a20f-7172-4436-a418-afc91020ba0f&locationName=Medan%2C+Sumatera+Utara&lowestLocationLevel=3&page=1&sortBy=LATEST",
    "https://glints.com/id/opportunities/jobs/explore?keyword=social+media&country=ID&locationId=3a47657b-facc-45dc-9d7f-1c6fb25f49d4&locationName=Kab.+Deli+Serdang%2C+Sumatera+Utara&lowestLocationLevel=3&page=1&sortBy=LATEST",
    // Marketing
    "https://glints.com/id/opportunities/jobs/explore?keyword=marketing&country=ID&locationId=a6f7a20f-7172-4436-a418-afc91020ba0f&locationName=Medan%2C+Sumatera+Utara&lowestLocationLevel=3&page=1&sortBy=LATEST",
    "https://glints.com/id/opportunities/jobs/explore?keyword=Staff+Marketing&country=ID&locationId=3a47657b-facc-45dc-9d7f-1c6fb25f49d4&locationName=Kab.+Deli+Serdang%2C+Sumatera+Utara&lowestLocationLevel=3&page=1&sortBy=LATEST",
    // IT
    "https://glints.com/id/opportunities/jobs/explore?keyword=IT&country=ID&locationId=a6f7a20f-7172-4436-a418-afc91020ba0f&locationName=Medan%2C+Sumatera+Utara&lowestLocationLevel=3&page=1&sortBy=LATEST",
    "https://glints.com/id/opportunities/jobs/explore?keyword=IT&country=ID&locationId=3a47657b-facc-45dc-9d7f-1c6fb25f49d4&locationName=Kab.+Deli+Serdang%2C+Sumatera+Utara&lowestLocationLevel=3&page=1&sortBy=LATEST",
    // Office Boy
    "https://glints.com/id/opportunities/jobs/explore?keyword=Office+Boy+%2F+Office+Girl&country=ID&locationId=3a47657b-facc-45dc-9d7f-1c6fb25f49d4&locationName=Kab.+Deli+Serdang%2C+Sumatera+Utara&lowestLocationLevel=3&page=1&sortBy=LATEST",
    // JobStreet Medan Terbaru
    "https://id.jobstreet.com/id/jobs/in-Medan-Sumatera-Utara?sortmode=listeddate",
    // Glints Medan Terbaru (sortBy=LATEST)
    "https://glints.com/id/opportunities/jobs/explore?country=ID&locationId=a6f7a20f-7172-4436-a418-afc91020ba0f&locationName=Medan%2C+Sumatera+Utara&lowestLocationLevel=3&sortBy=LATEST",
    // Glints Deli Serdang Terbaru (sortBy=LATEST)
    "https://glints.com/id/opportunities/jobs/explore?country=ID&locationId=3a47657b-facc-45dc-9d7f-1c6fb25f49d4&locationName=Kab.+Deli+Serdang%2C+Sumatera+Utara&lowestLocationLevel=3&sortBy=LATEST",
    // LokerMedan
    "https://lokermedan.co.id/",
    // Glints IT Sumatera Utara
    "https://glints.com/id/opportunities/jobs/explore?keyword=IT&country=ID&locationId=ce7eb5cb-583a-40b2-b12b-0e17f59469e6&locationName=Sumatera+Utara&lowestLocationLevel=2&page=1&sortBy=LATEST",
    // Glints Marketing Sumatera Utara
    "https://glints.com/id/opportunities/jobs/explore?keyword=MARKETING&country=ID&locationId=ce7eb5cb-583a-40b2-b12b-0e17f59469e6&locationName=Sumatera+Utara&lowestLocationLevel=2&page=1&sortBy=LATEST",
    // Glints IT Remote
    "https://glints.com/id/opportunities/jobs/explore?keyword=IT&country=ID&locationName=All+Cities%2FProvinces&lowestLocationLevel=1&workArrangementOptions=%2CREMOTE&page=1&sortBy=LATEST",
    // Glints Sumatera Utara Remote
    "https://glints.com/id/opportunities/jobs/explore?country=ID&locationId=ce7eb5cb-583a-40b2-b12b-0e17f59469e6&locationName=Sumatera+Utara&lowestLocationLevel=2&workArrangementOptions=REMOTE&sortBy=LATEST",
    // JobStreet ICT Medan
    "https://id.jobstreet.com/id/jobs-in-information-communication-technology/in-Medan-Sumatera-Utara?sortmode=listeddate",
    // JobStreet ICT Sumatera Utara
    "https://id.jobstreet.com/id/jobs-in-information-communication-technology/in-Sumatera-Utara?sortmode=listeddate",
    // JobStreet ICT Remote
    "https://id.jobstreet.com/id/jobs-in-information-communication-technology/remote?sortmode=listeddate",
    // JobStreet Purchasing Medan
    "https://id.jobstreet.com/id/Purchasing-jobs/in-Medan-Sumatera-Utara?sortmode=listeddate",
    // Loker.id IT Sumatera Utara
    "https://www.loker.id/cari-lowongan-kerja?q=it&lokasi=sumatera-utara",
    // Loker.id Sumatera Utara (Semua)
    "https://www.loker.id/lokasi-pekerjaan/sumatera-utara",
    // Loker.id IT Sumatera Utara (Kategori)
    "https://www.loker.id/lowongan-kerja/information-technology/sumatera-utara",
    // Glints Explore Deli Serdang Default
    "https://glints.com/id/opportunities/jobs/explore?slug=indonesia%2Fsumatra-utara%2Fkab-deli-serdang&locationId=3a47657b-facc-45dc-9d7f-1c6fb25f49d4&country=ID&filterLocationIds=3a47657b-facc-45dc-9d7f-1c6fb25f49d4&sortBy=LATEST"
];

const BLACKLIST_COMPANIES = ["PT ALFA SCORPII", "ALFA SCORPII"];

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_NOTIFICATIONS_PER_RUN = 1000; // Increased to ensure no jobs are missed

// Helper to check freshness (max 3 days)
function isFresh(text) {
    if (!text) return false;
    const lower = text.toLowerCase();

    // "Baru saja", "menit yang lalu", "jam yang lalu" -> Always fresh
    if (lower.includes("baru saja") || lower.includes("menit") || lower.includes("jam") || lower.includes("just now") || lower.includes("minutes") || lower.includes("hours")) {
        return true;
    }

    // Check for short format like "2h ago", "10m ago"
    if (lower.match(/\d+\s*(h|m)\b\s*ago/)) {
        return true;
    }

    // Check days
    // Matches "1 hari", "2 days", "3 hari yang lalu", "2d ago", etc.
    const dayMatch = lower.match(/(\d+)\s*(hari|day|d\s*ago)/);
    if (dayMatch) {
        const days = parseInt(dayMatch[1]);
        return days <= 3; // Limit 3 days
    }

    // "minggu" or "bulan" -> Old
    if (lower.includes("minggu") || lower.includes("week") || lower.includes("bulan") || lower.includes("month") || lower.match(/\d+\s*(w|mo)\b\s*ago/)) {
        return false;
    }

    return false; // Strict default
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

async function sendTelegramMessage(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const response = await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });
        console.log("Telegram message sent:", response.data.ok);
    } catch (error) {
        console.error("Failed to send Telegram message:", error.message);
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
                            let companyName = companyEl ? companyEl.innerText : "";

                            // Fallback if link not found: Try to find common patterns or use specific index
                            if (!companyName) {
                                const lines = container.innerText.split('\n').filter(l => l.trim().length > 0);
                                // In Glints cards, company is often after salary or 2nd/3rd line
                                companyName = lines[2] || lines[1] || "Unknown Company";
                            }

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

                            // Extract company from URL slug: job-title-company-city.html
                            const slug = href.split('/').pop().replace('.html', '');
                            const slugParts = slug.split('-');
                            let company = "Loker.id";
                            // City is usually last part, company before it
                            if (slugParts.length >= 3) {
                                // Last part is usually city name
                                company = slugParts.slice(-2, -1).join(' ').replace(/^\w/, c => c.toUpperCase()) || "Loker.id";
                            }

                            // Try to get details from parent container
                            let details = "";
                            const container = linkEl.closest('.card, .job-item, article, div[class*="item"], div[class*="col"], div[class*="list"], tr, li');
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
                    const uniqueId = `${job.title.trim().toLowerCase()}-${job.company.trim().toLowerCase()}`;
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

                        // Check if it's an IT job based on title
                        // Comprehensive IT Keywords (Software, Infra, Hardware, Data, Creative/Digital)
                        const itKeywords = [
                            'IT', 'Programmer', 'Developer', 'Software', 'Frontend', 'Backend', 'Fullstack',
                            'Data', 'Network', 'Networking', 'Jaringan', 'System', 'DevOps', 'Cloud', 'AWS', 'Azure',
                            'UI', 'UX', 'Web', 'Mobile', 'Android', 'iOS', 'Flutter', 'React', 'Node', 'PHP', 'Laravel',
                            'WordPress', 'CMS', 'SEO', 'Hardware', 'Teknisi Komputer', 'Computer', 'Support', 'Helpdesk',
                            'CCTV', 'Infrastruktur', 'Information Technology', 'Security', 'Cyber', 'QA', 'Tester', 'Game'
                        ].join('|');
                        job.isItJob = new RegExp(itKeywords, 'i').test(job.title);

                        allNewJobsToNotify.push(job);
                        console.log(`Added to notification queue: ${job.title} at ${job.company}`);
                    }
                }

            } catch (err) {
                console.error(`Error scraping ${url}:`, err.message);
            }

            await delay(3000); // Wait between pages
        }

        // --- BATCH SEND ALL NEW JOBS ---
        if (allNewJobsToNotify.length === 0) {
            console.log("No new jobs found in this run. Sending update.");
            await sendNotification("BELUM ADA LOKER FI, KALAU SUDAH DI PANGGIL PERGI SAJA INTERVIEW FI, KALAU GAK UDAH PASTI KAU GAGAL  ");
        } else {
            console.log(`Processing ${allNewJobsToNotify.length} new jobs for Telegram...`);
            let batchedMessage = "";
            let jobsInBatch = 0;

            for (const job of allNewJobsToNotify) {
                if (job.isItJob) {
                    batchedMessage += `🚨 <b>[URGENT: LOKER IT]</b> 🚨\n💻 <b>${job.title}</b>\n🏢 ${job.company}\n🔗 <a href="${job.link}">Buka Lowongan</a>\n\n`;
                } else {
                    batchedMessage += `✅ <b>${job.title}</b>\n🏢 ${job.company}\n🔗 <a href="${job.link}">Buka Lowongan</a>\n\n`;
                }

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

            // Send remaining jobs unbatched
            if (jobsInBatch > 0) {
                batchedMessage += `🔥 <i>#Semangat Arfi</i>`;
                await sendNotification(batchedMessage);
                await delay(2000);
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
