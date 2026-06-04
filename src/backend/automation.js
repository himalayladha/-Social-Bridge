import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

// Helper to wait
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Paths to browser sessions
const WA_SESSION_DIR = path.join(process.cwd(), '.sessions', 'whatsapp');
const IG_SESSION_DIR = path.join(process.cwd(), '.sessions', 'instagram');

// Realistic user-agent and viewport settings to prevent bot detection
const BROWSER_OPTIONS = (headless) => ({
  headless,
  viewport: { width: 1280, height: 800 },
  bypassCSP: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled'
  ]
});

/**
 * Connect to WhatsApp (Headed Browser)
 * Opens WhatsApp Web so the user can scan the QR code.
 * Detects when logged in and saves the session.
 */
export async function connectWhatsApp(logCallback) {
  logCallback('Launching WhatsApp in headed mode for QR scan...');
  
  if (!fs.existsSync(path.join(process.cwd(), '.sessions'))) {
    fs.mkdirSync(path.join(process.cwd(), '.sessions'), { recursive: true });
  }

  const context = await chromium.launchPersistentContext(WA_SESSION_DIR, BROWSER_OPTIONS(false));
  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
    logCallback('Navigated to web.whatsapp.com. Please scan the QR code in the browser window.');

    // Wait for the main screen search bar or chat list to appear (means logged in)
    // 3 minutes timeout to give the user enough time
    const loginSelector = 'div[contenteditable="true"][data-tab="3"], [data-testid="chat-list-search"], [data-testid="chat-list"]';
    await page.waitForSelector(loginSelector, { timeout: 180000 });
    
    logCallback('Login detected! Finalizing session sync...');
    await delay(5000); // Wait for storage to sync
    logCallback('WhatsApp session successfully saved!');
    await context.close();
    return true;
  } catch (error) {
    logCallback(`WhatsApp Login failed or closed: ${error.message}`, 'error');
    try {
      await context.close();
    } catch (_) {}
    return false;
  }
}

/**
 * Connect to Instagram (Headed Browser)
 * Opens Instagram so the user can log in.
 * Saves the session on success.
 */
export async function connectInstagram(logCallback) {
  logCallback('Launching Instagram in headed mode for login...');

  if (!fs.existsSync(path.join(process.cwd(), '.sessions'))) {
    fs.mkdirSync(path.join(process.cwd(), '.sessions'), { recursive: true });
  }

  const context = await chromium.launchPersistentContext(IG_SESSION_DIR, BROWSER_OPTIONS(false));
  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
    logCallback('Navigated to Instagram. Please log in to your account.');

    // Wait for home feed page or profile picture to indicate login
    const loggedInSelector = 'svg[aria-label="Home"], svg[aria-label="Reels"], a[href="/direct/inbox/"], img[alt*="profile"]';
    await page.waitForSelector(loggedInSelector, { timeout: 180000 });

    logCallback('Instagram login detected! Finalizing session sync...');
    await delay(5000);
    logCallback('Instagram session successfully saved!');
    await context.close();
    return true;
  } catch (error) {
    logCallback(`Instagram Login failed or closed: ${error.message}`, 'error');
    try {
      await context.close();
    } catch (_) {}
    return false;
  }
}

/**
 * Convert any image format (like WebP from Instagram) to a standard JPEG format
 * using the browser's canvas rendering context. This prevents WhatsApp Web
 * from treating WebP files as stickers rather than photos.
 */
async function convertToJpeg(page, imageBuffer) {
  const base64Image = imageBuffer.toString('base64');
  const jpegBase64 = await page.evaluate(async (base64) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const base64Data = dataUrl.split(',')[1];
        resolve(base64Data);
      };
      img.onerror = (e) => reject(new Error('Image loading failed in browser canvas: ' + e.message));
      img.src = 'data:image/webp;base64,' + base64;
    });
  }, base64Image);
  
  return Buffer.from(jpegBase64, 'base64');
}

/**
 * Helper to find the main post image on the details page by checking image sizes.
 * Post images are always large, whereas profile pictures and interface icons are small.
 */
async function findInstagramPostImage(page, logCallback) {
  logCallback('[Instagram] Searching for the main post image...');
  
  // Try common selectors first to speed it up
  const selectors = [
    'article img',
    'main img',
    'img[style*="object-fit"]',
    'img[srcset]'
  ];

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();
      for (let i = 0; i < count; i++) {
        const img = locator.nth(i);
        const src = await img.getAttribute('src');
        if (src && (src.includes('cdninstagram') || src.includes('fbcdn') || src.includes('instagram'))) {
          // Verify element size to ensure it's not a tiny icon or profile image
          const box = await img.boundingBox();
          if (box && box.width > 200 && box.height > 200) {
            logCallback(`[Instagram] Image found via selector "${selector}" (${Math.round(box.width)}x${Math.round(box.height)})`);
            return src;
          }
        }
      }
    } catch (e) {}
  }

  // Fallback: Check every single img tag on the page
  logCallback('[Instagram] Standard selectors failed. Checking all images on page...');
  const allImgs = page.locator('img');
  const count = await allImgs.count();
  for (let i = 0; i < count; i++) {
    try {
      const img = allImgs.nth(i);
      const src = await img.getAttribute('src');
      if (src) {
        const box = await img.boundingBox();
        if (box && box.width > 200 && box.height > 200) {
          logCallback(`[Instagram] Image found via general scanner (${Math.round(box.width)}x${Math.round(box.height)})`);
          return src;
        }
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Helper to find the main post video on the details page.
 */
async function findInstagramPostVideo(page, logCallback) {
  logCallback('[Instagram] Searching for video elements...');
  
  // Try locating video tag inside article/main first to isolate the main post media
  const selectors = [
    'article video',
    'main video',
    'video'
  ];
  
  for (const selector of selectors) {
    try {
      const videoLocator = page.locator(selector);
      const count = await videoLocator.count();
      for (let i = 0; i < count; i++) {
        const video = videoLocator.nth(i);
        const src = await video.getAttribute('src');
        if (src) {
          // Verify element size to ensure it's the main post video
          const box = await video.boundingBox();
          if (box && box.width > 200 && box.height > 200) {
            logCallback(`[Instagram] Video found via selector "${selector}": ${src.slice(0, 100)} (${Math.round(box.width)}x${Math.round(box.height)})`);
            return src;
          }
        }
      }
    } catch (e) {}
  }
  
  // Alternative: check meta tags for og:video, og:video:url, og:video:secure_url
  const metaSelectors = [
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video:secure_url"]'
  ];
  
  for (const selector of metaSelectors) {
    try {
      const locator = page.locator(selector);
      if (await locator.count() > 0) {
        const content = await locator.first().getAttribute('content');
        if (content && (content.startsWith('http://') || content.startsWith('https://') || content.startsWith('blob:'))) {
          logCallback(`[Instagram] Video URL found in meta "${selector}": ${content.slice(0, 100)}`);
          return content;
        }
      }
    } catch (e) {}
  }
  
  return null;
}

/**
 * Helper to download media from standard HTTPS URLs or browser-level blob: URLs
 */
async function downloadMedia(page, url, logCallback) {
  if (url.startsWith('blob:')) {
    logCallback(`[Instagram] Downloading blob URL from browser context...`);
    const base64Data = await page.evaluate(async (blobUrl) => {
      const getBlobData = async (targetUrl) => {
        let iframe;
        
        // 1. Try fetching from clean iframe context
        try {
          iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          
          const cleanFetch = iframe.contentWindow.fetch;
          if (cleanFetch) {
            const response = await cleanFetch(targetUrl);
            const blob = await response.blob();
            document.body.removeChild(iframe);
            return blob;
          }
        } catch (e) {
          if (iframe && iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }

        // 2. Try XMLHttpRequest from clean iframe context
        try {
          iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          
          const CleanXHR = iframe.contentWindow.XMLHttpRequest;
          if (CleanXHR) {
            const blob = await new Promise((resolve, reject) => {
              const xhr = new CleanXHR();
              xhr.open('GET', targetUrl, true);
              xhr.responseType = 'blob';
              xhr.onload = () => {
                if (xhr.status === 200 || xhr.status === 0) {
                  resolve(xhr.response);
                } else {
                  reject(new Error('Clean XHR status: ' + xhr.status));
                }
              };
              xhr.onerror = (e) => reject(new Error('Clean XHR connection error'));
              xhr.send();
            });
            document.body.removeChild(iframe);
            return blob;
          }
        } catch (e) {
          if (iframe && iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }

        // 3. Fallback to native window.fetch (our previous method)
        try {
          const nativeFetch = (Window.prototype && Window.prototype.fetch) || window.fetch;
          const response = await nativeFetch.call(window, targetUrl);
          return await response.blob();
        } catch (e) {}

        // 4. Fallback to native window.XMLHttpRequest
        try {
          return await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', targetUrl, true);
            xhr.responseType = 'blob';
            xhr.onload = () => {
              if (xhr.status === 200 || xhr.status === 0) {
                resolve(xhr.response);
              } else {
                reject(new Error('XHR status: ' + xhr.status));
              }
            };
            xhr.onerror = (e) => reject(new Error('XHR connection error'));
            xhr.send();
          });
        } catch (e) {}

        throw new Error('All blob download strategies failed.');
      };

      const blob = await getBlobData(blobUrl);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = (e) => reject(new Error('FileReader failed: ' + e));
        reader.readAsDataURL(blob);
      });
    }, url);
    return Buffer.from(base64Data, 'base64');
  } else {
    logCallback(`[Instagram] Downloading standard URL...`);
    const response = await page.request.get(url);
    return await response.body();
  }
}

/**
 * Extract Instagram Caption with robust fallbacks
 */
async function extractInstagramCaption(page) {
  // Helper to clean up caption from metadata string
  const extractCaptionFromMeta = (content) => {
    if (!content) return null;
    
    // Pattern 1: "... on Instagram: "CAPTION""
    let match = content.match(/on Instagram:\s*["']([\s\S]*)["']/i);
    if (match && match[1]) return match[1].trim();
    
    // Pattern 2: "... on [Date]: "CAPTION"" (common in descriptions)
    match = content.match(/on\s+[A-Za-z]+\s+\d+,\s+\d+:\s*["']([\s\S]*)["']/i);
    if (match && match[1]) return match[1].trim();
    
    // Pattern 3: general "... on [anything]: "CAPTION""
    match = content.match(/on\s+[^:]+:\s*["']([\s\S]*)["']/i);
    if (match && match[1]) return match[1].trim();
    
    return null;
  };

  // Try extracting from Meta tags first (description, og:description, og:title, etc.)
  try {
    const metaSelectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[property="og:title"]',
      'meta[name="twitter:description"]',
      'meta[name="twitter:title"]'
    ];
    
    for (const selector of metaSelectors) {
      const locator = page.locator(selector);
      const count = await locator.count();
      for (let i = 0; i < count; i++) {
        const content = await locator.nth(i).getAttribute('content');
        const caption = extractCaptionFromMeta(content);
        if (caption && caption.length > 0) {
          return caption;
        }
      }
    }
  } catch (e) {}

  // Try page title
  try {
    const title = await page.title();
    const caption = extractCaptionFromMeta(title);
    if (caption && caption.length > 0) {
      return caption;
    }
  } catch (e) {}

  // Fallback 1: Try h1 element in the post page (typically where Instagram puts caption for accessibility)
  try {
    const h1Locator = page.locator('h1');
    const count = await h1Locator.count();
    for (let i = 0; i < count; i++) {
      const text = await h1Locator.nth(i).innerText();
      if (text && text.trim().length > 0) {
        return text;
      }
    }
  } catch (e) {}

  // Fallback 2: First substantial span on the page
  try {
    const spans = page.locator('span');
    const count = await spans.count();
    for (let i = 0; i < count; i++) {
      const text = await spans.nth(i).innerText();
      // Skip usernames, likes, counts, time, etc. (typically short or contains key phrases)
      if (text && text.length > 20 && !text.includes('likes') && !text.includes('comments') && !text.includes('following')) {
        return text;
      }
    }
  } catch (e) {}

  return '';
}


/**
 * Main Scrape & Send Automation Loop
 */
export async function runAutomation(config, logCallback) {
  const { clients = [], runHeadless = false, onlyToday = true } = config;

  if (clients.length === 0) {
    logCallback('No clients configured. Skipping automation run.', 'warn');
    return [];
  }

  logCallback(`Starting automation run for ${clients.length} clients...`);

  // --- STAGE 1: LAUNCH BOTH BROWSERS ---
  logCallback('[Instagram] Launching browser...');
  const igContext = await chromium.launchPersistentContext(IG_SESSION_DIR, BROWSER_OPTIONS(runHeadless));
  const igPage = igContext.pages()[0] || await igContext.newPage();

  logCallback('[WhatsApp] Launching browser...');
  const waContext = await chromium.launchPersistentContext(WA_SESSION_DIR, BROWSER_OPTIONS(runHeadless));
  const waPage = waContext.pages()[0] || await waContext.newPage();

  const results = [];
  const capturedVideos = new Map();

  igPage.on('response', async (response) => {
    const url = response.url();
    try {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('json') || url.includes('/api/v1/') || url.includes('graphql')) {
        const json = await response.json();
        const findVideosInJson = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          
          const code = obj.shortcode || obj.code;
          if (code && (obj.video_url || (Array.isArray(obj.video_versions) && obj.video_versions.length > 0))) {
            const videoUrl = (obj.video_versions && obj.video_versions[0].url) || obj.video_url;
            capturedVideos.set(code, videoUrl);
          }
          
          for (const key of Object.keys(obj)) {
            findVideosInJson(obj[key]);
          }
        };
        findVideosInJson(json);
      }
    } catch (e) {}
  });

  let waAuthenticated = false;

  try {
    // Navigate to WhatsApp Web and check login once at the start
    logCallback('[WhatsApp] Navigating to WhatsApp Web...');
    await waPage.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });

    logCallback('[WhatsApp] Waiting for chat list or login QR code...');
    const chatSearchSelector = 'input[placeholder="Search or start a new chat"], input[aria-label="Search or start a new chat"], div[contenteditable="true"][data-tab="3"], div[contenteditable="true"]';
    const chatListSelector = '[data-testid="chat-list"]';
    const qrCodeSelector = 'canvas, [data-testid="qrcode"]';
    
    const startTime = Date.now();
    const timeoutMs = 120000; // 2 minutes wait max

    while (Date.now() - startTime < timeoutMs) {
      if (await waPage.locator(chatSearchSelector).count() > 0 && await waPage.locator(chatSearchSelector).first().isVisible()) {
        waAuthenticated = true;
        break;
      }
      if (await waPage.locator(chatListSelector).count() > 0 && await waPage.locator(chatListSelector).first().isVisible()) {
        waAuthenticated = true;
        break;
      }
      if (await waPage.locator(qrCodeSelector).count() > 0 && await waPage.locator(qrCodeSelector).first().isVisible()) {
        break;
      }
      await delay(1000);
    }

    if (!waAuthenticated) {
      throw new Error('WhatsApp session not authenticated. Please click "Connect WhatsApp" on the dashboard first to log in.');
    }

    logCallback('[WhatsApp] WhatsApp authenticated successfully.');

    // Now process each client
    for (const client of clients) {
      const { instagram: targetInstagramUsername, whatsapp: targetWhatsAppGroupName, lastSentPost } = client;
      logCallback(`--- Processing Client: Instagram=@${targetInstagramUsername} -> WhatsApp Group="${targetWhatsAppGroupName}" ---`);

      let tempMediaPath = null;
      let postInfo = null;

      try {
        try {
          await igPage.goto(`https://www.instagram.com/${targetInstagramUsername}/`, { waitUntil: 'load', timeout: 30000 });
        } catch (e) {
          logCallback(`[Instagram] Profile page navigation warning (attempting to proceed): ${e.message}`, 'warn');
        }

        if (igPage.url().includes('login')) {
          throw new Error('Instagram session expired or not logged in. Please connect your Instagram account first on the dashboard.');
        }

        logCallback('[Instagram] Waiting for posts to load...');
        const postLinkLocator = igPage.locator('a[href*="/p/"], a[href*="/reel/"]').first();
        try {
          await postLinkLocator.waitFor({ state: 'visible', timeout: 30000 });
        } catch (e) {
          throw new Error(`No posts or reels found on @${targetInstagramUsername}'s profile or profile is private.`);
        }

        let postHref = await igPage.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
          for (const link of links) {
            const hasPin = !!link.querySelector('svg[aria-label*="Pinned"], svg[aria-label*="pinned"], svg[aria-label*="Pin"], svg[aria-label*="pin"]');
            if (!hasPin) {
              return link.getAttribute('href');
            }
          }
          return null;
        });

        if (!postHref) {
          logCallback('[Instagram] No non-pinned post identified. Falling back to first post grid item.', 'warn');
          postHref = await postLinkLocator.getAttribute('href');
        }

        if (!postHref) {
          throw new Error('Unable to retrieve the latest post link.');
        }

        const shortcode = postHref.split('/').filter(Boolean).pop();
        logCallback(`[Instagram] Latest non-pinned post/reel found with shortcode: ${shortcode}`);

        if (lastSentPost === shortcode) {
          logCallback(`[Instagram] Post ${shortcode} has already been sent to WhatsApp for this client. Skipping.`, 'info');
          results.push({ client, status: 'skipped', reason: 'Already sent', shortcode });
          continue;
        }

        // Navigate to post page
        logCallback(`[Instagram] Navigating to post details page...`);
        const targetUrl = postHref.startsWith('http') ? postHref : `https://www.instagram.com${postHref}`;
        try {
          await igPage.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
        } catch (e) {
          logCallback(`[Instagram] Post details page navigation warning (attempting to proceed): ${e.message}`, 'warn');
        }
        await delay(3000);

        // Get date
        const timeLocator = igPage.locator('time').first();
        await timeLocator.waitFor({ state: 'attached', timeout: 10000 });
        const datetimeStr = await timeLocator.getAttribute('datetime');
        if (!datetimeStr) {
          throw new Error('Could not find post timestamp.');
        }

        const postDate = new Date(datetimeStr);
        const today = new Date();
        const isToday = postDate.getFullYear() === today.getFullYear() &&
                        postDate.getMonth() === today.getMonth() &&
                        postDate.getDate() === today.getDate();

        logCallback(`[Instagram] Post timestamp: ${postDate.toLocaleString()}`);

        if (onlyToday && !isToday) {
          logCallback(`[Instagram] Latest post was created on ${postDate.toLocaleDateString()}, which is not today. Skipping.`, 'warn');
          results.push({ client, status: 'skipped', reason: 'Post not from today', shortcode });
          continue;
        }

        // Get media source
        let mediaSrc = capturedVideos.get(shortcode);
        let isVideo = false;
        
        if (mediaSrc) {
          logCallback(`[Instagram] Video post detected via network interception.`);
          isVideo = true;
        } else {
          logCallback(`[Instagram] Scanning page elements for video...`);
          mediaSrc = await findInstagramPostVideo(igPage, logCallback);
          if (mediaSrc) {
            logCallback(`[Instagram] Video post detected via element selector.`);
            isVideo = true;
          } else {
            logCallback(`[Instagram] Checking for image post...`);
            mediaSrc = await findInstagramPostImage(igPage, logCallback);
            if (!mediaSrc) {
              throw new Error('Could not find post image or video source URL.');
            }
          }
        }

        // Get Caption
        logCallback('[Instagram] Extracting caption...');
        const caption = await extractInstagramCaption(igPage);
        logCallback(`[Instagram] Scraped caption (preview): "${caption.slice(0, 60)}..."`);

        // Download media content
        logCallback('[Instagram] Downloading media content...');
        let buffer = await downloadMedia(igPage, mediaSrc, logCallback);

        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        if (isVideo) {
          tempMediaPath = path.join(tempDir, `post_${shortcode}.mp4`);
          await fs.promises.writeFile(tempMediaPath, buffer);
          logCallback(`[Instagram] Video downloaded successfully to: ${tempMediaPath}`);
        } else {
          try {
            logCallback('[Instagram] Converting WebP image to standard JPEG...');
            buffer = await convertToJpeg(igPage, buffer);
          } catch (err) {
            logCallback(`[Instagram] Image format conversion failed: ${err.message}. Sending original format.`, 'warn');
          }
          tempMediaPath = path.join(tempDir, `post_${shortcode}.jpg`);
          await fs.promises.writeFile(tempMediaPath, buffer);
          logCallback(`[Instagram] Image downloaded successfully to: ${tempMediaPath}`);
        }

        postInfo = {
          shortcode,
          caption,
          imagePath: tempMediaPath,
          isVideo,
          date: postDate.toISOString()
        };

        // --- STAGE 2: SEND TO WHATSAPP ---
        logCallback(`[WhatsApp] Searching for group: "${targetWhatsAppGroupName}"...`);
        const searchInput = waPage.locator(chatSearchSelector).first();
        await searchInput.click();
        
        // Clear search first
        await waPage.keyboard.press('Control+A');
        await waPage.keyboard.press('Delete');
        await searchInput.fill(targetWhatsAppGroupName);
        await delay(2000);

        // Select the chat
        logCallback('[WhatsApp] Opening group chat...');
        const chatTitleSelector = `#pane-side span[title="${targetWhatsAppGroupName}"], [data-testid="chat-list"] span[title="${targetWhatsAppGroupName}"], span[title="${targetWhatsAppGroupName}"]`;
        const contactElement = waPage.locator(chatTitleSelector).first();
        
        await contactElement.waitFor({ state: 'visible', timeout: 15000 });
        await contactElement.click();
        
        // Validate that the correct chat header is open
        const activeHeaderSelector = `header span[title="${targetWhatsAppGroupName}"], [data-testid="conversation-header"] span[title="${targetWhatsAppGroupName}"], header span:has-text("${targetWhatsAppGroupName}")`;
        const activeHeader = waPage.locator(activeHeaderSelector).first();
        try {
          await activeHeader.waitFor({ state: 'visible', timeout: 8000 });
          logCallback(`[WhatsApp] Verified: Chat "${targetWhatsAppGroupName}" is open.`);
        } catch (e) {
          throw new Error(`Failed to verify that the chat "${targetWhatsAppGroupName}" was opened. Active chat header not found.`);
        }

        logCallback('[WhatsApp] Chat opened!');
        await delay(2000);

        // Trigger file upload
        logCallback('[WhatsApp] Triggering file upload...');
        const plusButtonSelectors = [
          'button:has(span[data-testid="plus-rounded"])',
          '[data-testid="plus-rounded"]',
          '[aria-label="Attach"]',
          'div[title="Attach"]',
          'button[title="Attach"]'
        ];

        let plusButton = null;
        for (const sel of plusButtonSelectors) {
          if (await waPage.locator(sel).count() > 0) {
            plusButton = waPage.locator(sel).first();
            break;
          }
        }

        if (!plusButton) {
          throw new Error('Could not find WhatsApp attach/plus button.');
        }

        const photoVideoButtonSelector = 'button[aria-label="Photos & videos"], [aria-label="Photos & videos"]';
        const photoVideoButton = waPage.locator(photoVideoButtonSelector).first();

        let menuOpened = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          logCallback(`[WhatsApp] Clicking plus button (attempt ${attempt})...`);
          try {
            if (attempt % 2 === 1) {
              await plusButton.click({ timeout: 5000 });
            } else {
              await plusButton.evaluate(el => el.click());
            }
            await photoVideoButton.waitFor({ state: 'visible', timeout: 3000 });
            menuOpened = true;
            break;
          } catch (e) {
            logCallback(`[WhatsApp] Attach menu did not open, retrying...`, 'warn');
          }
        }

        if (!menuOpened) {
          throw new Error('Failed to open attach menu after multiple attempts.');
        }

        logCallback('[WhatsApp] Setting up file chooser listener and clicking "Photos & videos"...');
        const fileChooserPromise = waPage.waitForEvent('filechooser', { timeout: 15000 });
        await photoVideoButton.click();
        
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(postInfo.imagePath);

        logCallback('[WhatsApp] Media uploaded. Waiting for media preview window...');
        const mediaPreviewSelector = 'div[contenteditable="true"]:not([data-testid="conversation-compose-box-input"]):not([data-tab="3"])';
        const captionBox = waPage.locator(mediaPreviewSelector).first();
        await captionBox.waitFor({ state: 'visible', timeout: 30000 });

        logCallback('[WhatsApp] Clearing caption in preview...');
        await captionBox.focus();
        await waPage.keyboard.press('Control+A');
        await waPage.keyboard.press('Delete');
        await delay(500);

        logCallback('[WhatsApp] Sending media...');
        const sendButtonSelector = 'button[aria-label="Send"], [data-testid="wds-ic-send-filled"], [data-testid="send"]';
        const sendButton = waPage.locator(sendButtonSelector).first();
        await sendButton.waitFor({ state: 'attached', timeout: 15000 });
        try {
          await sendButton.click({ force: true, timeout: 5000 });
          logCallback('[WhatsApp] Send button clicked natively.');
        } catch (err) {
          await sendButton.evaluate(el => el.click());
          logCallback('[WhatsApp] Send button clicked via DOM evaluate fallback.');
        }

        let sent = false;
        for (let i = 0; i < 25; i++) {
          await delay(1000);
          const isVisible = await captionBox.isVisible().catch(() => false);
          if (!isVisible) {
            sent = true;
            break;
          }
        }

        if (sent) {
          logCallback('[WhatsApp] Media send confirmed (preview closed). Waiting for file transmission...');
          await delay(5000);
        } else {
          logCallback('[WhatsApp] Warning: Media preview still open. Retrying via Enter...', 'warn');
          await sendButton.focus();
          await waPage.keyboard.press('Enter');
          await delay(10000);
        }

        logCallback('[WhatsApp] Media successfully sent!');

        if (postInfo.caption && postInfo.caption.trim().length > 0) {
          logCallback('[WhatsApp] Sending caption as a separate follow-up text message...');
          const mainInput = waPage.locator('[data-testid="conversation-compose-box-input"]').first();
          await mainInput.waitFor({ state: 'visible', timeout: 15000 });
          await mainInput.focus();
          await waPage.keyboard.press('Control+A');
          await waPage.keyboard.press('Delete');
          await waPage.keyboard.insertText(postInfo.caption);
          await delay(1000);
          await waPage.keyboard.press('Enter');
          logCallback('[WhatsApp] Caption text message successfully sent!');
          await delay(2000);
        }

        results.push({ client, status: 'success', shortcode, caption: postInfo.caption });

      } catch (clientError) {
        logCallback(`Error processing client @${targetInstagramUsername}: ${clientError.message}`, 'error');
        
        try {
          const tempScreenshotDir = path.join(process.cwd(), 'temp');
          if (!fs.existsSync(tempScreenshotDir)) {
            fs.mkdirSync(tempScreenshotDir, { recursive: true });
          }
          const screenshotPath = path.join(tempScreenshotDir, `error_${targetInstagramUsername}.png`);
          if (waPage) {
            await waPage.screenshot({ path: screenshotPath }).catch(() => {});
          }
        } catch (_) {}

        results.push({ client, status: 'failed', instagram: targetInstagramUsername, error: clientError.message });
      } finally {
        try {
          if (tempMediaPath && fs.existsSync(tempMediaPath)) {
            fs.unlinkSync(tempMediaPath);
          }
        } catch (_) {}
      }
    }

  } catch (globalError) {
    logCallback(`Global execution error: ${globalError.message}`, 'error');
    throw globalError;
  } finally {
    logCallback('[WhatsApp] Waiting 10 seconds for pending media and messages to finish transmitting...');
    await delay(10000);
    logCallback('[WhatsApp] Closing both browser contexts...');
    await igContext.close().catch(() => {});
    await waContext.close().catch(() => {});
  }

  return results;
}
