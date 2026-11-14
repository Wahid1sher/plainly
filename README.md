# Plainly: understand any letter, privately

**Plainly explains confusing letters, bills and official notices in plain language, and tells you what to do and by when. Your personal details are hidden on your own device before anything can reach the cloud.**

Built for **#BuildHybridAI 2026** with **Firebase AI Logic hybrid inference** (Gemini Nano in Chrome + Gemini in the cloud).

**▶ Live demo: https://plainly-hybrid-7dgez.web.app** (best in desktop Chrome with Gemini Nano; works in any browser via the cloud path)

---

## The problem

Millions of people get letters they can't fully understand: hospital bills, rent increase notices, benefits recertification requests, insurance denials, immigration notices. Missing one deadline can mean losing food assistance, paying a bill you didn't owe, or missing an appeal window.

AI can explain these letters well. But these are the **most private documents people own**: names, addresses, dates of birth, account, case and member numbers. Pasting them into a cloud chatbot is a real risk, and many of the people who need help most (older adults, immigrants, people with low literacy) are rightly wary of doing it.

## The idea: hybrid AI as a privacy boundary

Most hybrid apps use on-device AI as a fallback. Plainly uses the device as a **privacy boundary**:

| Step | Where it runs | Firebase AI Logic mode |
|---|---|---|
| **1. Privacy Shield**: find names, addresses, IDs, DOB, phones, emails and swap them for placeholders like `[NAME_1]` | Always on-device (pattern rules + Gemini Nano) | `ONLY_ON_DEVICE`: the raw document is never sent anywhere |
| **2. Privacy Router**: choose where to explain, based on privacy mode, Nano availability, document length, output language and connectivity | Local code ([`router.ts`](src/lib/router.ts)) | n/a |
| **3. Explain, Ask, Draft reply**: run on the **redacted** text | On-device for short docs, cloud for long or complex ones | `PREFER_ON_DEVICE`, `ONLY_IN_CLOUD`, `PREFER_IN_CLOUD` or `ONLY_ON_DEVICE` |
| **4. Re-hydrate**: put the user's real details back into the answer | On this device | n/a |

The placeholder-to-detail map (the "vault") **never leaves the device**: it isn't sent to the AI and isn't saved to Firestore. The cloud only ever sees `[NAME_1]`, yet the user reads their own name in the answer and in the reply letter.

### Three privacy modes

- **🔒 Strict local**: nothing leaves the device. Long documents are handled by **on-device map-reduce**: Gemini Nano reads the document in parts, takes notes, then explains the notes.
- **⚖️ Balanced** (default): on-device first. Goes to the cloud (redacted) only when the document is too long for Nano, Nano can't write the chosen language, or Nano isn't available. If Nano fails mid-request, it automatically retries in the cloud.
- **☁️ Best quality**: cloud first (redacted), with on-device fallback when offline.

Every result includes a **Privacy receipt** showing where each step ran (📱 On-device / ☁️ Cloud, with timings), what was hidden, and *exactly* the text the AI saw.

## Features

- Plain-language summary, urgency, key points, money table, "don't miss" fine print, and questions to ask the sender
- **Action checklist with deadlines** and days left, plus **Add to calendar** (.ics with a 3-day reminder)
- **Ask follow-up questions** (streamed, hybrid)
- **Draft a reply**: payment plan, itemized bill, dispute or appeal, financial help. The letter is written with placeholders and filled in locally; "Copy with my details" gives you the finished letter.
- **Photo of a letter → text** using Gemini Nano's multimodal input on-device. If Nano isn't available, Plainly asks before sending the unredacted image to the cloud.
- **12 output languages** and a **"Very simple" reading level**. Languages Nano can't write are routed to the cloud automatically.
- **Works offline** (PWA + on-device model) for the whole pipeline
- **Saved documents** in Firestore, redacted only and private to each anonymous user

## How Firebase is used

| Product | Use |
|---|---|
| **Firebase AI Logic** (`firebase/ai`) | `getGenerativeModel(ai, { mode, inCloudParams, onDeviceParams })` for every call; `initializeDeviceModel()` for the Nano download with progress; `response.inferenceSource` to show where each call ran; JSON output with one JSON Schema used as both `responseJsonSchema` (cloud) and `responseConstraint` (on-device). See [`src/lib/ai.ts`](src/lib/ai.ts) and [`src/lib/pipeline.ts`](src/lib/pipeline.ts). |
| **App Check** | reCAPTCHA Enterprise provider (required by AI Logic); debug tokens for local development |
| **Authentication** | Anonymous sign-in, so each person's saved items are private |
| **Firestore** | Saved analyses (redacted only) with an offline persistent cache. [`firestore.rules`](firestore.rules) only let a user access their own items and **reject any document containing a `vault` field**. |
| **Remote Config** | Tune routing live without a release: `on_device_max_chars`, `cloud_model`, `local_chunk_chars`, `default_privacy_mode`, `on_device_shield` (kill switch). See [`remoteconfig.template.json`](remoteconfig.template.json). |
| **Hosting** | Static hosting of the PWA |

## Architecture

```
src/
  lib/
    ai.ts          Hybrid engine: builds Firebase AI Logic models per InferenceMode, records inferenceSource
    router.ts      Privacy Router: pure function, fully unit-tested
    redact.ts      Privacy Shield: pattern rules, merging Nano findings, placeholders, re-hydration
    pipeline.ts    shield → route → explain (+ on-device map-reduce), ask, draftReply, transcribePhoto
    prompts.ts     Prompts + JSON schemas shared by device and cloud
    firebase.ts    App, App Check, AI, Auth, Firestore, Remote Config
    store.ts       Firestore (redacted) + local-only vault
    ics.ts         Calendar export
  components/      Header (privacy modes, Nano status/download), Composer, ProgressView, ResultView, HistoryList
```

## Run it

Requirements: Node 20+, and **Chrome with the built-in Prompt API (Gemini Nano)** for on-device inference. Other browsers still work and use the cloud for the explanation step.

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev
```

### Firebase setup (about 10 minutes)

1. Create a project at <https://console.firebase.google.com> and add a **Web app**. Copy its config into `.env.local`.
2. **AI Logic** → *Get started* → choose the **Gemini Developer API**.
3. **App Check** → register the web app with **reCAPTCHA Enterprise** and put the site key in `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`. For local development keep `VITE_APPCHECK_DEBUG=true`, open the app, copy the debug token from the browser console, and add it under *App Check → Manage debug tokens*. Then **enforce** App Check for AI Logic.
4. **Authentication** → enable **Anonymous**.
5. **Firestore** → create a database.
6. Deploy rules, Remote Config and hosting:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add
   npm run build
   firebase deploy
   ```

### Turning on Gemini Nano in Chrome

Use a recent Chrome on a desktop that meets the [hardware requirements](https://developer.chrome.com/docs/ai/get-started). If the header says *"Gemini Nano can be turned on"*, click **Turn on** (Chrome only allows the download after a click). Progress is shown in the header.

### Try it without Firebase

Set `VITE_MOCK_AI=true` in `.env.local` to click through the interface with a fake AI. Mock mode is for UI work only; the real app always uses Firebase AI Logic.

### Tests

```bash
npm test
```

These cover the Privacy Shield (PII detection, keeping amounts/dates/organisations, placeholder round-trip) and every Privacy Router branch.

## Limits and honesty

- Personal-detail detection is good but not perfect. That's why the Privacy receipt shows exactly what the AI saw, and why Strict local mode exists.
- Plainly explains documents; it does not give legal, medical or financial advice. It suggests who to contact.
- All sample documents are fictional.

## License

[Apache 2.0](LICENSE)
