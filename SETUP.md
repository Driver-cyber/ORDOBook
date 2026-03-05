# ORDOBOOK — Local Setup Guide

Follow these steps in order. Each section must complete before moving to the next.

---

## Prerequisites

You need Python 3.12, PostgreSQL 17, and Node.js installed.

### 1. Install Python 3.12
```bash
brew install python@3.12
```

Verify: `python3.12 --version` should print `Python 3.12.x`

### 2. Install PostgreSQL 17
```bash
brew install postgresql@17
brew services start postgresql@17
```

Add Postgres to your PATH — open `~/.zshrc` in any text editor and add this line at the bottom:
```
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
```

Then reload your shell:
```bash
source ~/.zshrc
```

Verify: `psql --version` should print `psql (PostgreSQL) 17.x`

### 3. Install Node.js (if not already installed)
```bash
brew install node
```

Verify: `node --version` should print `v20.x` or higher

---

## Database Setup

### 4. Create the database
```bash
createdb ordobook
```

If that fails with "role does not exist", run this first:
```bash
createuser -s postgres
createdb ordobook
```

---

## Backend Setup

### 5. Create the Python virtual environment
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/backend"
python3.12 -m venv venv
source venv/bin/activate
```

Your terminal prompt should now show `(venv)` at the start.

### 6. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 7. Configure environment variables
```bash
cp ../.env.example .env
```

Open `backend/.env` in a text editor. The default settings should work for a standard local install:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/ordobook
CORS_ORIGINS=http://localhost:5173
```

**Note:** If your local Postgres doesn't use a password, change the DATABASE_URL to:
```
DATABASE_URL=postgresql://postgres@localhost:5432/ordobook
```

### 8. Run database migrations
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/backend"
source venv/bin/activate
alembic upgrade head
```

You should see: `Running upgrade  -> 001, create clients table`

---

## Frontend Setup

### 9. Install frontend dependencies
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/frontend"
npm install
```

---

## Running the App

You need **two terminal windows** open simultaneously.

### Terminal 1 — Backend
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/backend"
source venv/bin/activate
uvicorn app.main:app --reload
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

### Terminal 2 — Frontend
```bash
cd "/Users/Shared/Claude-Projects/ORDO Projects/ORDOBook/frontend"
npm run dev
```

You should see:
```
  VITE v6.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

---

## Verify It's Working

1. Open **http://localhost:5173** in your browser
2. You should see the ORDOBOOK Client Roster (empty state)
3. Click **+ New Client**, fill in a name, click **Create Client**
4. You should land on the client's Profile page
5. Reload the page — the client should still be there (confirmed it persisted to PostgreSQL)

---

## Troubleshooting

**"connection refused" on backend start**
→ Postgres isn't running. Run: `brew services start postgresql@17`

**"role 'postgres' does not exist"**
→ Run: `createuser -s postgres` then retry

**"Module not found" errors in Python**
→ Make sure you activated the venv: `source venv/bin/activate`

**Port 8000 already in use**
→ Run: `lsof -i :8000` to see what's using it, or start uvicorn on a different port:
`uvicorn app.main:app --reload --port 8001`
(and update `vite.config.js` proxy target to match)

**Frontend shows blank page**
→ Open browser dev tools (Cmd+Option+I), check the Console tab for errors
