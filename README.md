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

### Frontend: Vercel
You can easily deploy the frontend to **Vercel** to host the control panel:
1.  Connect your GitHub repository to Vercel.
2.  Set the Framework Preset to **Vite**.
3.  Add the Environment Variable:
    *   `VITE_API_URL`: Set this to your running backend API URL (e.g. `https://your-backend-api.onrender.com`).
4.  Deploy!

### Backend: VPS / VM (Railway, Render, DigitalOcean)
> [!IMPORTANT]
> The backend relies on a persistent scheduler and runs Playwright chromium instances to automate the browser. Because of this, it is **not** compatible with Serverless architectures (like Vercel Serverless Functions) due to execution time limits and browser dependency restrictions. You must run the backend on a persistent VM/VPS.

1.  Deploy the codebase to a service that supports persistent processes (e.g. **Render Web Service** or **Railway**).
2.  Ensure your deployment environment installs Playwright browser dependencies (on Render, use the Playwright buildpack or compile environment).
3.  Set the `PORT` environment variable (defaults to `5000`).
4.  Run the start script:
    ```bash
    npm start
    ```
5.  Configure your client connections and let the scheduler run in the background.
