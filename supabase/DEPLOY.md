# ARCONZA — Supabase Edge Function Deployment Guide

## Prerequisites

1. **Supabase CLI** installed: `npm install -g supabase`
2. **Supabase project** already set up (you have the project URL + anon key in `public/app-config.json`)
3. **Gemini API key** from Google AI Studio: https://aistudio.google.com/apikey
4. **Upstash Redis** (optional — for rate limiting; the function works without it)

## Step 1: Login to Supabase

```bash
supabase login
```

This opens a browser to authenticate with your Supabase account.

## Step 2: Link the project

```bash
cd /path/to/buildmanager
supabase link --project-ref vmkdfhghyirbgdnmrfmu
```

Replace `vmkdfhghyirbgdnmrfmu` with your actual project ref (the subdomain of your Supabase URL).

## Step 3: Set the Gemini API key as a secret

```bash
supabase secrets set GEMINI_API_KEY=AIzaSy...your-key-here...
```

The Gemini API key is stored as a Supabase secret — it's NEVER included in the APK or visible to the client. The Edge Function reads it from `Deno.env.get('GEMINI_API_KEY')` at runtime.

## Step 4: (Optional) Set Upstash Redis for rate limiting

If you have an Upstash Redis database:

```bash
supabase secrets set \
  UPSTASH_REDIS_REST_URL=https://your-db.upstash.io \
  UPSTASH_REDIS_REST_TOKEN=your-token-here
```

If you skip this, the Edge Function will work fine but without rate limiting (it logs a warning and continues).

## Step 5: Deploy the Edge Function

```bash
# Deploy the ai-chat function (handles BOTH chat AND bill OCR)
supabase functions deploy ai-chat --no-verify-jwt
```

The `--no-verify-jwt` flag is important — it allows anonymous callers (the Android app sends the `apikey` header but doesn't always have a JWT). Rate limiting falls back to IP address when no JWT is present.

## Step 6: Verify the deployment

Test with curl:

```bash
# Test chat
curl -X POST \
  https://vmkdfhghyirbgdnmrfmu.supabase.co/functions/v1/ai-chat \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "What is the cost of cement per bag in India?" }]
      }
    ]
  }'

# You should get a JSON response with candidates[0].content.parts[0].text
```

## Step 7: Rebuild the Android APK

After deploying the Edge Function, rebuild the APK so the bundled assets include the latest JS changes:

```bash
cd /path/to/buildmanager
npm run build:android
cd android
./gradlew assembleRelease
```

## How it works

```
Android App (APK)
  │
  │  User asks AI a question or scans a bill
  │
  ├─ ai.js / bill-scanner.js calls SupabaseClient.getAiChatUrl()
  │   → returns: https://vmkdfhghyirbgdnmrfmu.supabase.co/functions/v1/ai-chat
  │
  ├─ fetch() includes headers:
  │   • Content-Type: application/json
  │   • apikey: <supabase anon key>     ← required by Supabase gateway
  │   • Authorization: Bearer <user JWT> ← for per-user rate limiting
  │
  └─ Supabase Edge Function (ai-chat)
      │
      ├─ Reads GEMINI_API_KEY from Deno.env
      ├─ Validates input (message count, size, image size)
      ├─ Rate limits via Upstash (10 req/min per user or IP)
      ├─ Determines system instruction (chat vs OCR based on content)
      ├─ Calls Gemini API: gemini-2.5-flash:generateContent
      │
      └─ Returns Gemini response to app
```

## Troubleshooting

### "Function not found" (404)
- Make sure you deployed with the correct function name: `supabase functions deploy ai-chat`
- Verify the function is listed: `supabase functions list`

### "Unauthorized" (401)
- Make sure the `apikey` header is included in the request (the latest `ai.js` and `bill-scanner.js` handle this automatically)
- Verify the anon key in `public/app-config.json` matches your Supabase project

### "AI service not configured" (503)
- The `GEMINI_API_KEY` secret is not set. Run: `supabase secrets set GEMINI_API_KEY=...`

### "Rate limited" (429)
- You've sent more than 10 requests in 60 seconds. Wait a minute and try again.
- If you need higher limits, modify the `slidingWindow(10, '60 s')` in `supabase/functions/ai-chat/index.ts`

### CORS errors
- The Edge Function allows Capacitor origins (`capacitor://localhost`, `ionic://localhost`, `https://localhost`) and localhost variants. If you see CORS errors, check the console for the actual Origin header being sent.

### Bill OCR returns no items
- Make sure the bill image is clear and well-lit
- The Gemini model (gemini-2.5-flash) handles both printed and handwritten bills
- Maximum image size: 3MB (base64 ~4MB). The app compresses images before sending.
