# Social-Bridge: Instagram to WhatsApp Post Automator

Social-Bridge is a unified single-page dashboard control center designed to automatically scrap the latest posts and reels from configured Instagram accounts and post them directly to target WhatsApp groups using automation.

## Features
*   **Unified Dashboard**: High-fidelity dashboard supporting Light & Dark themes.
*   **Persistent Login Sessions**: Allows logging in once to both Instagram and WhatsApp; session cookies are stored locally to bypass recurring QR code scans/credentials prompts.
*   **Pinned Post Detection**: Smart detection automatically identifies and skips up to 3 pinned posts on Instagram profiles to correctly extract the most recent post/reel.
*   **Automated Scheduler**: Periodic scheduler checks for new media at a configurable interval.
*   **Multi-Client Operations**: Syncs multiple client profiles to separate WhatsApp group outputs.
*   **Live Log Stream**: Monitor execution progress and debug connection issues in real time.

---

## Local Setup

### 1. Installation
Clone the repository:
```bash
git clone https://github.com/himalayladha/-Social-Bridge.git
cd -Social-Bridge
```

### 2. Template Database Setup
Initialize configuration and history databases:
```bash
cp config.json.example config.json
cp db.json.example db.json
```

### 3. Run Locally
Launch the application. All dependency packages (`node_modules`) and Playwright Chromium binaries will be automatically checked and installed on the first run if they do not exist:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the dashboard control center.

---

## Deployment Guide
This application is designed to be run locally on your desktop machine or a local home server. Because it controls automated browser instances (Playwright chromium) and maintains active login sessions for Instagram and WhatsApp Web, running locally avoids headless detection flags, IP restriction blocks from Instagram, and enables seamless cookie caching. It is not intended or configured for cloud serverless platforms like Vercel.
