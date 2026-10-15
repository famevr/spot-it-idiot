# Spot It, Idiot! — Cloudflare version

The game plus one online leaderboard that anyone with the link can join. It runs on Cloudflare's free plan.

## What's in this folder

| File | What it is |
|---|---|
| `public/index.html` | The game (English + Thai). |
| `public/og.png` | The picture LINE, Facebook, X and WhatsApp show when someone shares the link. |
| `public/favicon.png`, `public/icon-512.png` | Browser tab and home-screen icons. |
| `src/worker.js` | The small server: saves scores and returns the top 100. |
| `schema.sql` | Creates the leaderboard tables. |
| `wrangler.jsonc` | Cloudflare settings. You paste one value into it (step 4). |

## Put it online from GitHub (no terminal)

1. **Put these files in your GitHub repository.** Open the repository on github.com → **Add file → Upload files**, drag in everything inside this folder (`public`, `src`, `README.md`, `package.json`, `schema.sql`, `wrangler.jsonc`), then click **Commit changes**.
2. **Create the database.** In the Cloudflare dashboard: **Storage & Databases → D1 SQL Database → Create**. Name it `spot-it-idiot` and copy its **Database ID**.
3. **Create the tables.** Open the new database → **Console**, paste the whole contents of `schema.sql`, click **Execute**.
4. **Add the Database ID to the settings.** On GitHub, open `wrangler.jsonc` → pencil icon, replace `PASTE-YOUR-DATABASE-ID-HERE` with the ID from step 2, then **Commit changes**.
5. **Connect GitHub to Cloudflare.** In the dashboard: **Workers & Pages → Create → Import a repository** (Continue with GitHub). Pick `spot-it-idiot`, leave the build settings as they are (deploy command `npx wrangler deploy`), click **Deploy**.
6. When it finishes, Cloudflare shows the game's address (`https://spot-it-idiot.<your-name>.workers.dev`). From now on, every change committed to GitHub is published automatically.

## Or put it online from your computer (about 10 minutes)

You need a computer with a terminal (Terminal on Mac, PowerShell on Windows).

1. **Make a free Cloudflare account** at <https://dash.cloudflare.com/sign-up>.
2. **Install Node.js** (the "LTS" version) from <https://nodejs.org>.
3. **Open a terminal in this folder** and run:
   ```
   npm install
   npx wrangler login
   ```
   A browser window opens. Click **Allow**.
4. **Create the database:**
   ```
   npx wrangler d1 create spot-it-idiot
   ```
   It prints a `database_id` (a long code like `a1b2c3d4-…`). Open `wrangler.jsonc`, replace `PASTE-YOUR-DATABASE-ID-HERE` with it, and save.
5. **Create the leaderboard tables:**
   ```
   npm run db:setup
   ```
   Type `y` if it asks to continue.
6. **Publish:**
   ```
   npm run deploy
   ```
   It prints your game's address, like `https://spot-it-idiot.<your-name>.workers.dev`. Done. Share that link.

## Updating the game later

Replace files in `public/` (or `src/worker.js`), then run `npm run deploy` again. Scores are kept.

## Using your own domain (optional)

In the Cloudflare dashboard: **Workers & Pages → spot-it-idiot → Settings → Domains & Routes → Add → Custom domain**. The domain has to be managed by Cloudflare.

## Try it on your own computer first (optional)

```
npm run db:setup:local
npm run dev
```
Then open <http://localhost:8787>.

## Good to know

- **Who's on the board:** everyone who opens the link. Each browser counts as one player and keeps its best score and fastest time. The name shown is the one they used for their best score.
- **Bots and cheating:** the shapes are drawn as pictures, so a script reading the page can't see which one is the answer; clicks made by a script are ignored; runs with superhuman or machine-steady reaction times aren't sent; the server only accepts a score with a signed start ticket from that game, and only if enough time has passed to earn it; and it rejects impossible results and limits each connection to one score every few seconds. That stops bots and casual cheating, but a determined person could still find a way. To remove one, use the dashboard: **Storage & Databases → D1 → spot-it-idiot → Console**, then run
  `DELETE FROM scores WHERE name = 'TheirName';`
- **Reset the whole leaderboard:** in the same Console, run `DELETE FROM scores;`
- **Free plan limits:** 100,000 Worker requests a day (each finished game uses about two) and 100,000 database writes a day. Images and other files don't count.
- **Link preview:** apps cache previews. If an old preview shows, paste the link into the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) and click "Scrape Again".
- **Privacy:** IP addresses aren't stored as they are. A scrambled version is kept for about a day, only to enforce the score limit.
