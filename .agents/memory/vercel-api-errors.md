---
name: Vercel API error responses
description: Durable guidance for keeping browser API calls usable when Vercel returns platform-level plain-text errors.
---

The frontend must read API responses as text first and then parse JSON, because Vercel can return a plain-text invocation error before a serverless handler produces its JSON response. Serverless handlers should also parse and validate request bodies inside their try/catch boundary and return JSON for malformed input. SMTP calls need explicit timeouts so the function returns a useful error before the platform timeout.

**Why:** Unconditional response.json() turns a useful server or platform failure into a misleading `Unexpected token` client error, and unbounded SMTP connections can be terminated by Vercel without a JSON response.

**How to apply:** Use a shared safe response reader for frontend API calls, keep request-body parsing inside handler error boundaries, and set SMTP connection/greeting/socket timeouts below the Vercel function limit.