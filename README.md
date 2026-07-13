<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and Deploy Your AI Studio App

This project is a high-performance React (Vite) single-page application (SPA) backed by a modular Express API server. It is carefully structured to run seamlessly in modern web hosting environments, with first-class support for serverless hosting on Vercel.

## 🚀 How to Migrate and Host on Vercel & GitHub

The codebase is fully compatible with Vercel Serverless Functions and SPA routing. To host this project on Vercel:

### 1. Push to GitHub
1. Export or download the ZIP of this project, or push it directly from your terminal:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of AI Studio App"
   ```
2. Create a new repository on GitHub and link it to your local project:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

### 2. Deploy to Vercel
1. Go to [Vercel](https://vercel.com/) and log in with your GitHub account.
2. Click **Add New** > **Project** and select your imported GitHub repository.
3. Vercel will automatically detect `vercel.json` and configure the settings:
   - **Framework Preset**: Vite / Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/client`
4. **Environment Variables**: Add any keys required by your app (e.g. `GEMINI_API_KEY`, etc.) in the Vercel project settings dashboard.
5. Click **Deploy**. Vercel will build your React application and deploy the API routes in `./api/index.ts` as serverless functions.

---

## 🛠️ Run Locally

**Prerequisites:** Node.js (v18+)

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Environment Variables:** Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key.
3. **Run the development server:**
   ```bash
   npm run dev
   ```
   This boots the Express backend server (under `server.ts`) which automatically mounts your Vite development middleware.

