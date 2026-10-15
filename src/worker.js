// Spot It, Idiot! — Cloudflare Worker
// Serves the game (from ./public) and a tiny leaderboard API backed by D1.
//
//   GET  /api/scores?me=<playerId>   -> { rows: [{ name, score, fastest, at, me }] }  (top 100)
//   POST /api/scores                 -> { ok: true, rows: [...] }
//        body: { playerId, name, score, fastest, level }
//
// Each browser has a random playerId; its row keeps that player's best score and fastest time.

const TOP_N = 100;
const MAX_SCORE = 5000;          // far beyond 200 levels + bonus levels; anything higher is fake
const MIN_FASTEST = 0.1;         // seconds; no human finds the shape faster than this
const MAX_FASTEST = 5;           // the slowest level allows 3 s, so a "best" time above this is fake
const SUBMIT_GAP_MS = 4000;      // one score per device/IP every few seconds (a game takes longer)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/scores') {
      try {
        if (request.method === 'GET') return json({ rows: await topScores(env, url.searchParams.get('me')) });
        if (request.method === 'POST') return await submit(request, env);
        return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST' });
      } catch (err) {
        console.error(err);
        // The reason helps when setting up (e.g. "no such table" = run schema.sql, missing DB = check wrangler.jsonc).
        return json({ error: 'Server error', detail: String(err && err.message || err).slice(0, 300) }, 500);
      }
    }

    // Everything else is the game itself. For the page, fill in the full address of the
    // link-preview image, because LINE / Facebook / X need absolute URLs.
    const res = await env.ASSETS.fetch(request);
    if ((res.headers.get('content-type') || '').includes('text/html')) {
      return new HTMLRewriter()
        .on('meta[data-abs]', {
          element(el) {
            const v = el.getAttribute('content') || '/';
            el.setAttribute('content', new URL(v, url.origin).toString());
            el.removeAttribute('data-abs');
          },
        })
        .transform(res);
    }
    return res;
  },
};

async function topScores(env, me) {
  const meId = validPlayerId(me) ? me : '';
  const { results } = await env.DB.prepare(
    `SELECT name, score, fastest, updated_at AS at, (player_id = ?1) AS me
       FROM scores
      ORDER BY score DESC, fastest IS NULL, fastest ASC, updated_at ASC
      LIMIT ?2`
  ).bind(meId, TOP_N).all();
  return results.map(r => ({ name: r.name, score: r.score, fastest: r.fastest, at: r.at, me: !!r.me }));
}

async function submit(request, env) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'Send JSON' }, 415);
  }
  const raw = await request.text();
  if (raw.length > 2000) return json({ error: 'Too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Bad JSON' }, 400); }

  // --- validate everything; reject impossible values ---
  const playerId = body.playerId;
  if (!validPlayerId(playerId)) return json({ error: 'Bad player id' }, 400);

  const name = cleanName(body.name);
  if (!name) return json({ error: 'Name must be 1–16 characters' }, 400);

  const score = body.score;
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return json({ error: 'Bad score' }, 400);

  let fastest = body.fastest;
  if (fastest === null || fastest === undefined) {
    if (score > 0) return json({ error: 'Missing time' }, 400);
    fastest = null;
  } else {
    if (typeof fastest !== 'number' || !isFinite(fastest) || fastest < MIN_FASTEST || fastest > MAX_FASTEST) {
      return json({ error: 'Bad time' }, 400);
    }
    fastest = Math.round(fastest * 100) / 100;
  }
  // You can't match more shapes than levels you reached.
  const level = body.level;
  if (!Number.isInteger(level) || level < 1 || score > level) return json({ error: 'Bad level' }, 400);

  // --- simple rate limit per IP (stored hashed, never the raw address) ---
  const now = Date.now();
  const ipHash = await sha256((request.headers.get('cf-connecting-ip') || 'unknown') + '|' + (env.RATE_SALT || 'spot-it-idiot'));
  const last = await env.DB.prepare('SELECT last_at FROM submit_log WHERE ip_hash = ?1').bind(ipHash).first();
  if (last && now - last.last_at < SUBMIT_GAP_MS) return json({ error: 'Slow down' }, 429);

  // --- keep each player's best: highest score, fastest time ---
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submit_log (ip_hash, last_at) VALUES (?1, ?2)
       ON CONFLICT(ip_hash) DO UPDATE SET last_at = excluded.last_at`
    ).bind(ipHash, now),
    env.DB.prepare(
      `INSERT INTO scores (player_id, name, score, fastest, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(player_id) DO UPDATE SET
         name       = CASE WHEN excluded.score >= scores.score THEN excluded.name ELSE scores.name END,
         fastest    = CASE WHEN scores.fastest IS NULL THEN excluded.fastest
                           WHEN excluded.fastest IS NULL THEN scores.fastest
                           ELSE MIN(scores.fastest, excluded.fastest) END,
         updated_at = CASE WHEN excluded.score > scores.score THEN excluded.updated_at ELSE scores.updated_at END,
         score      = MAX(scores.score, excluded.score)`
    ).bind(playerId, name, score, fastest, now),
  ]);

  // Now and then, forget old rate-limit entries so that table stays small.
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM submit_log WHERE last_at < ?1').bind(now - 86400000).run();
  }

  return json({ ok: true, rows: await topScores(env, playerId) });
}

function validPlayerId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(id);
}

function cleanName(v) {
  if (typeof v !== 'string') return '';
  // Drop control and invisible formatting characters, squeeze spaces, cap at 16 characters.
  const s = v.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, 16).join('');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
