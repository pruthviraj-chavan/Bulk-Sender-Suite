# Email Automation Web App

## Overview
A production-ready email automation web application for sending bulk emails with resume PDF attachments via Gmail SMTP. Built with Express + React (TypeScript). Restructured for Vercel deployment.

## Key Features
- Bulk email management (paste comma/line/semicolon separated)
- Resume PDF upload and attachment (base64 in-memory)
- Gmail SMTP configuration (email + app password)
- One-at-a-time email sending via serverless API (no timeouts)
- Real-time progress tracking (sent/failed/remaining)
- Stop sending capability
- Persistent email storage (localStorage in browser)
- Vercel-ready with serverless function

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend (dev)**: Express.js with nodemailer (same API as Vercel function)
- **Backend (Vercel)**: Serverless function at `/api/send-email`
- **Storage**: Browser localStorage for email list (no server-side storage needed)
- **Resume**: Loaded as base64 in browser memory, sent with each API call

## Project Structure
```
client/src/pages/dashboard.tsx  - Main dashboard with all UI (client-side state)
server/routes.ts                - Express route for local dev (mirrors Vercel function)
api/send-email.ts               - Vercel serverless function for sending one email
shared/schema.ts                - Shared TypeScript types and Zod schemas
vercel.json                     - Vercel deployment configuration
```

## API Endpoint
- `POST /api/send-email` - Send a single email
  - Body: `{ senderEmail, appPassword, senderName, subject, emailBody, recipientEmail, recipientName, resumeBase64?, resumeFilename? }`
  - Returns: `{ success: boolean, email: string, error?: string }`

## Email Sending Logic
- Frontend loops through emails one at a time
- Each email calls `/api/send-email` serverless function
- 3-5 second random delay between emails (client-side)
- Name extraction from email local part
- Dynamic greeting (Hi {name} or Hello)
- Gmail SMTP with TLS (smtp.gmail.com:587)
- Stop flag for graceful cancellation (client-side ref)

## Vercel Deployment
1. Push code to GitHub
2. Import in Vercel
3. Build command: `npx vite build`
4. Output directory: `dist/public`
5. Serverless function auto-detected from `/api/` directory
