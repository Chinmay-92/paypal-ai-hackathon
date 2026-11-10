# Owner checklist: steps only you can do

> **November 10 update — $0 limit:** Do not follow the billing or paid-upgrade suggestions in the older checklist below. The current demo is https://pact-web-mz18.onrender.com/demo in a separate free Render workspace with no card on file. Its free database expires December 10, before the stated judging end. A tested free continuity plan is still needed. A synthetic sandbox deposit, amendment, top-up, release and partial refund were exercised on November 10; see [the current submission draft](13-submission-draft.md). The full Gemini evaluation is still outstanding.

Things that need your accounts, money, judgment or identity. Tick them off as you go. Deadline: **November 13, 2026, 01:30 IST** (November 12, 12:00 PST). Aim to finish by November 11. Judging runs until **December 15, 2026**, and the demo must keep working until then.

Never paste secrets, sandbox passwords or API keys into chat, issues, commits or the video. Put them only in `.env.local`, the Render dashboard, or Devpost's private testing-instructions field.

## Track

- [ ] Enter Pact in **Business Solutions**: a tool that helps merchants and freelancers run their business. Pact keeps customer changes, approvals, PayPal payments and work instructions in sync. Don't choose *AI Agents or Automation*: that track asks for agents that transact on the user's behalf, and Pact deliberately never lets AI move money (every payment is approved by the buyer). Recorded as decision D28.

## 1. Deploy on Render (done: https://pact-web-h9pp.onrender.com)

PRs #4 and #5 are merged, so `main` is ready.

- [x] In the Render dashboard, choose **New → Blueprint** and pick `Chinmay-92/paypal-ai-hackathon`. It creates `pact-db` and `pact-web`, both free.
- [x] Enter the prompted values:
  - `APP_ORIGIN`: the service URL, e.g. `https://pact-web.onrender.com`
  - `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`: sandbox values
  - `PAYPAL_WEBHOOK_ID`: `pending` for now
  - `GEMINI_API_KEY`
- [x] Wait for the first deploy. If the real URL differs from your `APP_ORIGIN`, fix it under **pact-web → Environment**.
- [x] Open `https://<host>/api/health`. It should show `"database":"ok","payments":"paypal-sandbox"`.
- [x] Tell Claude the URL. It was checked on 2026-10-22: health, demo workspace, approval, and a sandbox order with redirect to PayPal.

## 2. Point PayPal webhooks at Render (done, verified 2026-10-22)

- [x] In developer.paypal.com (Sandbox), go to **Apps & Credentials → Default Application → Sandbox Webhooks**.
- [ ] Edit the old tunnel webhook (or add a new one) to `https://pact-web-h9pp.onrender.com/api/paypal/webhook`, with events `CHECKOUT.ORDER.APPROVED` and all `PAYMENT.CAPTURE.*`.
- [x] Copy the Webhook ID into `PAYPAL_WEBHOOK_ID` on Render. Saving redeploys.
- [ ] Delete the old tunnel webhook if you added a new one.

## 3. Gemini quota (decide)

The free key ran out of daily quota on October 22 (HTTP 429), so model evaluation numbers are missing, and the hosted demo will often fall back to the weaker rule-based extractor.

- [ ] Either enable billing on the Gemini key (recommended for the demo and judging period), or accept the free tier and run the evaluation on a quiet day.
- [ ] Then ask Claude to run `npm run eval:ai -- --write --delay=8000` and update the report and submission text with the real numbers.

## 4. A sandbox buyer for judges

- [ ] In **Testing Tools → Sandbox Accounts**, create a dedicated **Personal** (US) account for judges with a fake balance. Don't reuse your own.
- [ ] Keep its email and password for the Devpost private testing-instructions field only.
- [ ] Do one full test on the hosted site with it: deposit, amendment, top-up, release, refund.

## 5. Upgrade before submission (costs money, decide)

Free Postgres expires **30 days after creation** (before judging ends), and the free web service sleeps after 15 idle minutes (about a minute to wake).

- [ ] By November 11, in Render, change `pact-db` to the `0.1c-256mb` plan and `pact-web` to `0.5c-512mb`. Check whether hackathon credits apply.
- [ ] Optional: add a background worker (`npm run worker`) so unknown or pending payments settle without anyone clicking "Check payment status".
- [ ] Keep it paid and running until **December 15**.

## 6. Video (under 3 minutes)

- [ ] Follow the storyboard in [10-demo-submission.md](10-demo-submission.md). Use two windows: merchant on desktop, customer at phone size.
- [ ] Show real sandbox screens. Say "PayPal sandbox" out loud; don't show passwords.
- [ ] Include one failure case (e.g. a replaced proposal can't be approved, or a question that doesn't change the order).
- [ ] Upload to YouTube as **Public** and check it's under 3:00.

## 7. Devpost submission

- [ ] Use [13-submission-draft.md](13-submission-draft.md) for the description and fill in every TODO with real values.
- [ ] Repository URL (public, MIT license detected), hosted URL, YouTube URL.
- [ ] Testing instructions (private field): hosted URL, `/demo`, and the judges' sandbox buyer login.
- [ ] Disclose the tools used: PayPal REST APIs (sandbox), Gemini, Render; and that Claude Code helped write the code.
- [ ] Confirm your eligibility and registration on the rules page yourself.
- [ ] Submit. Claude will not submit for you.

## 8. Optional, but strengthens the business case

- [ ] Talk to 2 custom-goods shops and 2 small agencies using the questions in [09-validation.md](09-validation.md). Only quote findings you actually gathered.
- [ ] Ask for anonymized past examples of changed orders. Claude can turn them into extra evaluation cases.

## Already done

- [x] Rotate the Gemini key and PayPal secret exposed in chat (October 22).
- [x] Sandbox flow verified locally: deposit, top-up, release, partial refund, webhooks.
