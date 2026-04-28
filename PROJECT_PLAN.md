# LexAI SaaS Admin System Project Plan

## Overview
Build a production-ready SaaS admin system for "LexAI", an existing Netlify Functions-based RAG AI chatbot. 
The system provides a central dashboard to control API behavior, manage clients, and oversee the knowledge base.

## Architecture
- **Frontend**: React-based SaaS Dashboard (`src/pages/AdminSaaS.tsx`)
- **Backend**: Express/Node.js server with modular routes (`src/server/routes/adminRoutes.ts`)
- **Functions**: Support for Netlify Functions deployment
- **Database**: Supabase for settings, API keys, and document storage

## Core Features

### 1. Admin Dashboard (UI)
- **Settings**: Toggle API status (ON/OFF) and switch between LLM models (Gemini/Groq).
- **Client Management**: Generate and revoke API keys for different sites (multi-tenant support).
- **Knowledge Base**: View and manage indexed documents (vectors).

### 2. Admin API
- `GET /api/admin/settings`: Fetch system status and active model.
- `PATCH /api/admin/settings`: Update behavior remotely.
- `POST /api/admin/keys`: Generate new client site identifiers' access.
- `DELETE /api/admin/keys/:id`: Revoke access.
- `GET /api/admin/documents`: List knowledge base vectors.
- `DELETE /api/admin/documents/:id`: Remove specific context.

### 3. Dynamic RAG Pipeline
- The Chat API dynamically respects Admin settings.
- Validates client API keys against Supabase before processing.
- Filters search results by `site` and `context` for true multi-client isolation.

## Security
- **Admin Access**: Protected by a master `ADMIN_KEY` environment variable.
- **Client Access**: Protected by per-site `LexAI` API keys.
- **Dynamic Policy**: Ability to shut down the entire network via the dashboard.
