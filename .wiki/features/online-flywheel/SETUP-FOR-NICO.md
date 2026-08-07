# Flywheel online — the setup only you can do

This is the whole list of things I cannot do for you, because they need to be
created under your name, with your credit card and your email. Everything else
about building online Flywheel is handled without you.

You do not need to understand any of it. Follow the steps, and at the end copy
the values from the checklist at the bottom and send them to me.

**Total time: about 90 minutes.** You can do it in one sitting or spread it over
a few days, as long as the two sections marked BLOCKING happen first.

| # | Section | Time | When it's needed |
|---|---|---|---|
| 1 | Supabase (the game's memory) | 20 min | **BLOCKING** — nothing gets built until this exists |
| 2 | Vercel (puts the game on the internet) | 10 min | **BLOCKING** |
| 3 | "Sign in with Google" | 25 min | Can come later — the game works without it |
| 4 | "Sign in with HubSpot" | 30 min | Can come later — and probably will |
| 5 | A web address for the booth | 10 min | Can come later, but before UNBOUND |
| 6 | Send me the values | 5 min | After each section |

---

## ⚠️ Read this box before you start

Some of the values below are **secrets**. A secret is a password for the game
itself — anyone who has one can read and change every player's data.

**Never paste a secret into a chat window, an email, a text message, a Slack
message, or a document, and never have one on screen while screensharing.**

Every secret in this guide is labelled **SECRET** in red-flag terms right where
you copy it. To send me a secret, always use this one method:

1. Go to **https://onetimesecret.com**
2. Paste the value into the big box.
3. Click **Create a secret link**.
4. Send me the link it gives you.

That link works once and then destroys itself. That is the only way to hand me a
secret. Values labelled **safe** can be sent to me any way you like.

---

## 1. Supabase — where the game remembers people

**Time: about 20 minutes. BLOCKING.**

Supabase is the service that will store player accounts, scores, and
achievements, and keep everyone's screens in sync during a live game.

### Cost, so there are no surprises

Pick the **Pro** plan. It is **$25 per month**. The $10 figure from our earlier
conversation was one line item inside it; the real total is $25. The free plan
exists, but it puts a project to sleep after a week of quiet, which means the
game could be asleep when someone walks up to the booth. Not worth the risk. Pick
Pro.

### Steps

1. Go to **https://supabase.com** and click **Start your project** (top right).
   - *You should see:* a sign-in page offering GitHub, Google, or email.
2. Click **Continue with GitHub** and sign in with your GitHub account.
   - *You should see:* a page asking you to name a new organization.
3. In **Name**, type `ProvenLabs`.
4. Under **Plan**, choose **Pro**.
5. Click **Create organization**, then enter your card details when asked.
   - *You should see:* a "New project" form.
6. In **Project name**, type exactly: `flywheel`
7. Next to **Database Password**, click **Generate a password**.
8. Click the copy icon next to that password. **This is a SECRET.** Send it to me
   using the onetimesecret method in the box above, and label the link
   "Supabase database password".
9. For **Region**, choose **East US (North Virginia)**.
10. Click **Create new project**.
    - *You should see:* a progress screen for a minute or two, then a project
      dashboard with the word "flywheel" at the top left.

### Now collect three values

11. In the left sidebar, scroll to the bottom and click the gear icon labelled
    **Project Settings**.
12. In the settings menu, click **API Keys**.
    - *You should see:* a page with a web address at the top and a list of keys.
13. Copy the **Project URL**. It looks like
    `https://abcdefghijk.supabase.co`. **This one is safe** — send it to me
    however you like.
14. Copy the key that begins with **`sb_publishable_`**. **This one is safe.**
15. Click the eye or **Reveal** control next to the key beginning with
    **`sb_secret_`** and copy it. **This is a SECRET.** Send it via
    onetimesecret, labelled "Supabase secret key".

> If you get stuck: take a screenshot of whatever is on your screen and send it
> to me. Do not try to work out what went wrong, and if the screen is showing a
> secret key, blur or crop it out first.

---

## 2. Vercel — what puts the game on the internet

**Time: about 10 minutes. BLOCKING.**

Vercel takes the game's files from GitHub and serves them to anyone with the web
address. **A "deployment" just means: a fresh copy of the game went live.** Every
time I finish a change, a new deployment happens automatically and the live game
updates within a minute.

Cost: **free** for what we need.

### Steps

1. Go to **https://vercel.com** and click **Sign Up**.
2. Choose **Continue with GitHub** and sign in.
3. When asked to choose a plan, pick **Hobby** (the free one), then enter your
   name when prompted.
   - *You should see:* an empty Vercel dashboard.
4. Click the **Add New...** button (top right) and choose **Project**.
   - *You should see:* a list headed "Import Git Repository".
5. If your repositories are not listed, click **Adjust GitHub App Permissions**
   or **Install** and approve Vercel's access on the GitHub page that opens.
   - *You should see:* your repositories appear in the list.
6. Find **Flywheel** in the list and click **Import** next to it.
7. Leave every setting on the screen exactly as it is. Click **Deploy**.
   - *You should see:* a build animation, then a congratulations screen with a
     preview picture of the game.
8. On that screen, copy the web address ending in **`.vercel.app`**. **This is
   safe** — send it to me. It will look something like
   `flywheel-abc123.vercel.app`.

That address is the game, live, right now. It's the temporary one; section 5
covers giving it a proper name.

> If you get stuck: screenshot the screen and send it. In particular, if the
> deploy screen turns red, send me that screenshot — the failure text on it tells
> me exactly what to fix.

---

## 3. "Sign in with Google"

**Time: about 25 minutes. Not blocking — the game ships without it and gains it
later.**

This one happens in Google's own control panel, which is dense and ugly. Follow
the steps literally and ignore everything else on the screen.

### First, build the address you'll need twice below

Take the **Project URL** you copied in step 1.13 and add `/auth/v1/callback` to
the end of it. So if yours was `https://abcdefghijk.supabase.co`, the address you
need is:

`https://abcdefghijk.supabase.co/auth/v1/callback`

Write that down somewhere. Google calls it a "redirect URI". It has to be typed
in perfectly — no extra spaces, no trailing slash.

### Steps

1. Go to **https://console.cloud.google.com** and sign in with the Google account
   you want to own this.
2. At the very top of the page, click the project dropdown (it may say "Select a
   project"), then click **New Project**.
3. In **Project name**, type `Flywheel` and click **Create**.
   - *You should see:* a notification that the project was created. Click it, or
     use the top dropdown, so that "Flywheel" is the project shown at the top.
4. In the search bar at the top, type `Google Auth Platform` and click the result
   with that name.
   - *You should see:* a page inviting you to configure your project.
5. Click **Get started**.
6. Under **App name**, type `Flywheel`. Under **User support email**, choose your
   email from the dropdown. Click **Next**.
7. For **Audience**, choose **External**. Click **Next**.
8. Under **Contact Information**, enter your email. Click **Next**.
9. Tick the box to agree to the policy and click **Continue**, then **Create**.
   - *You should see:* an overview page with a left menu containing **Branding**,
     **Audience**, **Clients**, and **Data Access**.
10. In that left menu, click **Data Access**.
11. Click **Add or remove scopes**. In the filter box, find and tick these three,
    then click **Update** and **Save**:
    - `openid`
    - `.../auth/userinfo.email`
    - `.../auth/userinfo.profile`
12. In the left menu, click **Audience**. Under **Test users**, click **Add
    users**, enter your own email address, and click **Save**.
13. In the left menu, click **Clients**, then click **Create client**.
14. For **Application type**, choose **Web application**.
15. For **Name**, type `Flywheel Web`.
16. Under **Authorized JavaScript origins**, click **Add URI** and paste your
    `.vercel.app` address from step 2.8, with `https://` in front of it — for
    example `https://flywheel-abc123.vercel.app`.
17. Under **Authorized redirect URIs**, click **Add URI** and paste the
    `/auth/v1/callback` address you built above.
18. Click **Create**.
    - *You should see:* a panel titled "OAuth client created" showing a **Client
      ID** and a **Client secret**.
19. Copy the **Client ID**. It ends in `.apps.googleusercontent.com`. **This is
    safe** — send it to me.
20. Copy the **Client secret**. It starts with `GOCSPX-`. **This is a SECRET.**
    Send it via onetimesecret, labelled "Google client secret".

Once we have a proper web address (section 5), I will tell you the one extra line
to add to step 16's list. You will not have to work out what it is — I will send
you the exact text to paste.

> If you get stuck: screenshot it and send it. Google's console changes its menu
> names every few months, so if a button I named isn't there, a screenshot of the
> page you're on is all I need to redirect you.

---

## 4. "Sign in with HubSpot"

**Time: about 30 minutes. Not blocking.**

**Plain warning:** this is the fussiest of the three, HubSpot changed how these
apps are created in mid-2026, and it is the most likely one to still be
half-working the week of the conference. The game is designed so that Google and
plain email sign-in carry the booth on their own if this one isn't ready.

### Steps

1. Go to **https://developers.hubspot.com** and click **Create App Developer
   Account** (or **Sign in** if you already have one).
   - Important: this is a *developer* account, which is separate from your normal
     HubSpot account. Creating it does not touch or change anything in your real
     HubSpot.
   - *You should see:* an empty developer account home screen.
2. Look at the web address in your browser. It contains a number, like
   `app.hubspot.com/developer/12345678/`. Copy that number. **This is safe** —
   send it to me and call it the "HubSpot developer account ID".
3. In the top navigation, click **Apps**.
4. If there is a **Create app** button in the top right, click it, type `Flywheel`
   as the name, and save.
   - If there is **no** such button, stop here and send me a screenshot of the
     page. HubSpot has moved app creation for some accounts, and I will create the
     app for you from my side. Then come back and continue from step 5.
   - *You should see:* your app listed under **Apps**.
5. Click the app named **Flywheel**, then click the **Auth** tab.
   - *You should see:* a page with **Client ID**, **Client secret**, a **Redirect
     URLs** section, and a **Scopes** section.
6. In the **Scopes** section, click **Add new scope**, search for `oauth`, tick
   it, and save. That is the only scope to tick. Do not add others — every extra
   one makes HubSpot's review slower and adds a scary permission screen for
   players.
7. In the **Redirect URLs** section, click into the URL field and paste your
   `.vercel.app` address from step 2.8 with `/auth/hubspot/callback` on the end —
   for example:
   `https://flywheel-abc123.vercel.app/auth/hubspot/callback`
   Then click **Save changes**.
   - When we have a real web address (section 5), I will send you a second line to
     add here, written out in full for you to paste.
8. Copy the **Client ID**. **This is safe** — send it to me.
9. Copy the **Client secret**. **This is a SECRET.** Send it via onetimesecret,
   labelled "HubSpot client secret".

> If you get stuck: screenshot and send. Expect to get stuck at least once here;
> that is normal for HubSpot and not something you did wrong.

---

## 5. A web address for the booth

**Time: about 10 minutes. Not blocking, but do it before UNBOUND.**

**My recommendation: yes, buy one.** `flywheel-abc123.vercel.app` on a booth sign
looks like a prototype. A real address looks like a product, and it is the thing
people will type into their phones while standing in front of you. It costs
roughly **$20 for the year**.

Buy it inside Vercel so there is nothing to connect afterwards — it wires itself
up.

### Steps

1. Go to **https://vercel.com** and open the **Flywheel** project.
2. Click the **Domains** tab.
3. Click **Buy a domain** (or **Add Domain**, then the buy option).
4. In the search box, try these in order and take the first available one:
   - `playflywheel.com`
   - `flywheelgame.com`
   - `getflywheel.io`
5. Click **Buy** and complete the purchase.
   - *You should see:* the domain listed on the Domains tab, showing **Valid
     Configuration** within a few minutes.
6. Tell me which one you bought. **This is safe.**

Once you tell me, I will send you two short bits of text to paste back into
Google (section 3) and HubSpot (section 4) so sign-in keeps working on the new
address. You will not need to figure out what they say — they will arrive
ready to copy.

> If you get stuck: screenshot it. If the Domains tab shows anything other than
> "Valid Configuration" after an hour, send me that screenshot.

---

## 6. What to send me — the checklist

Send the **safe** ones however you like. Send each **SECRET** one as its own
onetimesecret link, with the label written next to it in your message.

| # | What to call it | Where you got it | What it looks like | Safe to send in chat? |
|---|---|---|---|---|
| 1 | Supabase project URL | Section 1, step 13 | `https://something.supabase.co` | ✅ Safe |
| 2 | Supabase publishable key | Section 1, step 14 | starts with `sb_publishable_` | ✅ Safe |
| 3 | Supabase secret key | Section 1, step 15 | starts with `sb_secret_` | 🔴 **SECRET — onetimesecret link only** |
| 4 | Supabase database password | Section 1, step 8 | random letters, numbers, symbols | 🔴 **SECRET — onetimesecret link only** |
| 5 | Vercel live address | Section 2, step 8 | ends in `.vercel.app` | ✅ Safe |
| 6 | Google client ID | Section 3, step 19 | ends in `.apps.googleusercontent.com` | ✅ Safe |
| 7 | Google client secret | Section 3, step 20 | starts with `GOCSPX-` | 🔴 **SECRET — onetimesecret link only** |
| 8 | HubSpot developer account ID | Section 4, step 2 | a number, 7 or 8 digits | ✅ Safe |
| 9 | HubSpot client ID | Section 4, step 8 | long string with dashes, like `1a2b3c4d-...` | ✅ Safe |
| 10 | HubSpot client secret | Section 4, step 9 | long string with dashes | 🔴 **SECRET — onetimesecret link only** |
| 11 | The domain you bought | Section 5, step 6 | e.g. `playflywheel.com` | ✅ Safe |

Items 1, 2, 3 and 5 unblock the build. The rest can arrive whenever you get to
them.

### One last check before you send

Look at your message. If any line in it starts with `sb_secret_` or `GOCSPX-`, or
is a random password, delete it and send that one as a onetimesecret link
instead. That is the only mistake in this whole document that costs anything to
undo.

---

## Where this fits

You do not need to open either of these — they are for whoever builds the thing.

- [README.md](README.md) — the index for the whole online-Flywheel plan.
- [00-objective-overview.md](00-objective-overview.md) — what online Flywheel is
  for and where it goes after UNBOUND.
