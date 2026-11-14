# #BuildHybridAI submission kit

Everything you need to submit Plainly on Devpost. Deadline: **Nov 30, 2026, 2:00pm PST**. Aim to submit by **Nov 28** to leave a buffer.

## Checklist

- [ ] Firebase project set up (AI Logic, App Check **enforced**, Anonymous auth, Firestore, Remote Config). See README.
- [ ] Deployed to Firebase Hosting: `npm run build && firebase deploy` (hosted URL for judges)
- [ ] Tested in Chrome **with Gemini Nano on** (Balanced + Strict local) and in a browser **without** it (cloud path)
- [ ] Public GitHub repo with the **Apache-2.0 license visible in the About section** (GitHub detects `LICENSE` automatically)
- [ ] Repo description + topics: `firebase`, `gemini-nano`, `hybrid-ai`, `privacy`, `chrome-ai`
- [ ] Demo video, **under 3:00**, public on YouTube, in English
- [ ] Devpost form: platform = **Web (Chrome)**, repo URL, video URL, hosted URL, the text below
- [ ] Screenshots: home, results, Privacy receipt, Strict local, mobile

---

## Devpost text (copy and paste)

**Tagline:** Understand any letter, bill or notice in plain language. Your personal details are hidden on your device first.

### Inspiration
A hospital bill, a rent increase, a food-assistance recertification letter. These are the documents where a missed deadline costs people the most, and they're written in language that's hardest to follow. AI is great at explaining them, but they're also the most private papers people own. Asking someone to paste their name, date of birth and case number into a cloud chatbot is asking a lot, especially the older adults, immigrants and people with low literacy who need the help most.

### What it does
Plainly turns a confusing document into: a plain-language summary, an urgency level, a checklist of what to do with deadlines and days left (exportable to your calendar), a table of the amounts that matter, fine print you might miss (financial help, appeal rights, legal limits), and good questions to ask the sender. You can ask follow-up questions, draft a reply letter (payment plan, itemized bill, dispute, financial help), photograph a letter instead of typing it, and get everything in 12 languages or at a very simple reading level.

### How we use Firebase AI Logic hybrid inference
We use the device as a **privacy boundary**, not just a fallback:

1. **Privacy Shield (always on-device).** Pattern rules plus Gemini Nano with `InferenceMode.ONLY_ON_DEVICE` find names, addresses, IDs, dates of birth, phones and emails, and replace them with placeholders like `[NAME_1]`. The raw document is never sent anywhere.
2. **Privacy Router.** A small, unit-tested policy picks the `InferenceMode` for each request from the user's privacy mode, Nano availability, document length, output language and connectivity. Short documents use `PREFER_ON_DEVICE`. Long ones, or languages Nano can't write yet, use `ONLY_IN_CLOUD` on the redacted text. Offline uses `ONLY_ON_DEVICE`.
3. **Strict local mode with on-device map-reduce.** When the user wants nothing to leave the device, long documents are split into parts, Gemini Nano takes notes on each part, then explains the notes.
4. **Local re-hydration.** Placeholders in the AI's answer are swapped back for the real details on the device, so the user reads their own name while the cloud only ever saw `[NAME_1]`. The vault isn't saved to Firestore, and our security rules reject any document that contains one.
5. **Honest trace.** Every step records `response.inferenceSource` and timing. The Privacy receipt shows exactly where each step ran and exactly what text the AI saw.

We use one JSON Schema for both paths (`responseJsonSchema` in the cloud, `responseConstraint` on-device). We download Nano with `initializeDeviceModel()` and a progress bar, use Nano's image input for photos (we ask for consent before an unredacted photo goes to the cloud), and stream follow-up answers with `generateContentStream`.

**Other Firebase products:** App Check (reCAPTCHA Enterprise, enforced), Anonymous Authentication, Firestore (redacted history, offline cache, strict rules), Remote Config (on-device length limit, cloud model, chunk size, default privacy mode, Nano-shield kill switch), and Hosting.

### Challenges
- Getting Gemini Nano to return reliable structured JSON. We use `responseConstraint` with a tight schema, plus an automatic cloud retry on the redacted text in Balanced mode.
- Redaction that doesn't destroy meaning. We keep amounts, dates and organisation names, and hide only personal details, with tests for both.
- Nano's context and language limits. These became routing rules and the on-device map-reduce instead of failures.

### What we learned
Hybrid inference is more than "fast and free when it can be". The device is the one place you can safely look at raw private data, so it's the right place to decide what the cloud is allowed to see.

### What's next
Android (Gemini Nano via Firebase AI Logic) and iOS (Apple Foundation Models) clients sharing the same router policy and Remote Config, a camera-first flow for phones, and partnerships with legal-aid clinics, patient advocates and benefits navigators.

### Built with
firebase-ai-logic, gemini-nano, gemini, chrome-prompt-api, firebase-app-check, firebase-auth, cloud-firestore, firebase-remote-config, firebase-hosting, react, typescript, vite

---

## Demo video script (about 2:50)

Record in Chrome with Gemini Nano on. Use a screen recorder at 1080p, zoom the browser to about 125%, and keep the pace brisk.

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | A real-looking bill on the desk, then the Plainly home page | "This is a hospital bill. It has my name, my date of birth, my account number, and a deadline I could easily miss. I want AI to explain it, but I don't want to hand all of that to the cloud." |
| 0:15–0:30 | Header: privacy modes, "Gemini Nano ready" | "Plainly uses Firebase AI Logic hybrid inference. Gemini Nano runs right here in Chrome, and Gemini in the cloud is used only when it's needed." |
| 0:30–1:05 | Load the hospital bill, click Explain, then show the progress steps and the results | "First, the Privacy Shield runs on-device and hides my name, birth date, address and account numbers. The Privacy Router sees this is a short document, so Gemini Nano explains it on-device. I get what it means, what I owe, the deadline with days left, and the fine print: I may qualify for charity care." |
| 1:05–1:25 | Click "Add deadlines to my calendar", ask "Can I get a payment plan?" | "One click puts the deadlines in my calendar. I can ask follow-up questions, and the answers stream back on-device." |
| 1:25–1:45 | Draft a payment-plan reply, then "Copy with my details" | "It drafts a reply. The AI wrote it with placeholders, and my real name, address and account number are filled in locally." |
| 1:45–2:15 | Open the Privacy receipt and scroll the redacted text | "The Privacy receipt shows exactly where each step ran and exactly what the AI saw: placeholders, never my details." |
| 2:15–2:35 | Switch the language to Farsi or Vietnamese and run the benefits letter; the badge shows Cloud | "Gemini Nano can't write Farsi yet, so the router sends this to the cloud automatically, still redacted. Same SDK, same code path." |
| 2:35–2:50 | Strict local mode, airplane mode on, run it again: everything shows On-device | "In Strict local mode, nothing leaves my device, even offline. Long documents are read in parts by Nano." |
| 2:50–3:00 | Logo | "Plainly. Understand any letter, privately." |

Add English captions (YouTube auto-captions, then fix them).

## Tips to score higher

- **Technological implementation:** in the video, briefly show `router.ts` and the `inferenceSource` badges. Judges want to see hybrid used deliberately.
- **Design:** use the real deployed URL in the video, not localhost.
- **Impact:** name the audience ("benefits recipients, patients, tenants") and the cost of a missed deadline.
- **Grand Prize:** multi-platform gets "strong consideration". If time allows, a small Android client using Firebase AI Logic hybrid with the same prompts and Remote Config would strengthen the entry a lot. Mention it under "What's next" either way.
