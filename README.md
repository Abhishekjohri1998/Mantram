# Mantram AI

Mantram AI is now separated into two standalone directories for better maintainability and independent deployments.

## 📂 Project Structure

- **`/backend`**: Node.js & Express API
  - Handles authentication, database (MongoDB), and AI integrations (Claude, Gemini, etc.).
  - Runs on port `3001` by default.
- **`/frontend`**: Vite & React Application
  - The user interface for Mantram AI.
  - Proxies `/api` requests to the backend on `localhost:3001`.
  - Runs on port `5173` by default.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- MongoDB Atlas (or local instance)

### 2. Backend Setup
```bash
cd backend
npm install
npm run dev
```
*Note: Ensure you have your `.env` file inside the `backend/` directory.*

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 🛠️ Configuration & Organization
- **Shopify Config**: `backend/shopify.app.toml` is the single source of truth for the Shopify application. Do NOT add config files to the root.
- **Maintenance Scripts**: Utility tools for data fixes and migrations are located in `scripts/`.
- **Testing**: Backend tests are organized within `backend/__tests__/`.
- **Environment**: Use `backend/.env` and `frontend/.env`.

---

## 🛠️ Key Commands

| Directory | Command | Description |
|-----------|---------|-------------|
| Backend | `npm run dev` | Starts the API server with logging |
| Frontend | `npm run dev` | Starts the Vite dev server |
| Frontend | `npm run build` | Builds the production bundle |

## 📐 Architecture
- **Backend**: Express, Mongoose, JWT, Multer
- **Frontend**: React, Vite, Tailwind CSS (v4), React Router v6
- **AI Integrations**: Anthropic Claude, Google Gemini, OpenAI
