# Email Automation Web App

## Overview
A production-ready email automation web application for sending bulk emails with resume PDF attachments via Gmail SMTP. Built with Express + React (TypeScript) on the Replit fullstack template.

## Key Features
- Bulk email management (paste comma/line/semicolon separated)
- Resume PDF upload and attachment
- Gmail SMTP configuration (email + app password)
- Background email sending with threading (non-blocking)
- Real-time progress tracking (sent/failed/remaining)
- Stop sending capability
- Error logging to file
- Persistent email storage (JSON file)

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend**: Express.js with nodemailer for SMTP, multer for file uploads
- **Storage**: JSON file (`data/emails.json`) for email list persistence
- **Uploads**: PDF files stored in `uploads/` directory
- **Logs**: Failed emails logged to `data/failed_emails.log`

## Project Structure
```
client/src/pages/dashboard.tsx  - Main dashboard with all UI sections
server/routes.ts                - All API endpoints
server/storage.ts               - File-based storage layer
shared/schema.ts                - Shared TypeScript types and Zod schemas
data/                           - Persistent data (emails.json, logs)
uploads/                        - Uploaded resume PDFs
```

## API Endpoints
- `GET /api/emails` - List all emails
- `POST /api/emails` - Add bulk emails (body: `{ emails: "raw text" }`)
- `DELETE /api/emails` - Clear all emails
- `DELETE /api/emails/:email` - Remove single email
- `GET /api/resume` - Get resume info
- `POST /api/resume` - Upload resume PDF (multipart/form-data)
- `DELETE /api/resume` - Delete resume
- `GET /api/progress` - Get sending progress (polled every 1s)
- `POST /api/send` - Start sending (body: SMTP config)
- `POST /api/stop` - Stop sending

## Email Sending Logic
- Background thread (async, non-blocking)
- 3-5 second random delay between emails
- Name extraction from email local part
- Dynamic greeting (Hi {name} or Hello)
- Gmail SMTP with TLS (smtp.gmail.com:587)
- Stop flag for graceful cancellation
