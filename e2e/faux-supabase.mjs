// Faux Supabase pour les tests de bout en bout (étapes 5 et 6), SANS accès Internet.
//
// Il imite les seules parties de l'API Supabase utilisées par le jeu :
//   - connexion anonyme (POST /auth/v1/signup), session, rafraîchissement ;
//   - appels de fonctions (POST /rest/v1/rpc/<nom>), exécutés au nom du joueur
//     (rôle « authenticated », RLS actives), exactement comme PostgREST ;
//   - le chrono serveur (_tick_all toutes les secondes, comme pg_cron).
// Le temps réel (WebSocket) n'est PAS imité : le jeu doit alors se rabattre sur sa
// relecture régulière. La base est un vrai PostgreSQL (PGlite) avec les migrations du dépôt.
//
// Utilisation : node e2e/faux-supabase.mjs [port]   (54321 par défaut)
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const PORT = Number(process.argv[2] ?? 54321);

const db = new PGlite();
await db.exec(readFileSync(join(ROOT, 'tests', 'stub-supabase.sql'), 'utf8'));
for (const f of readdirSync(join(ROOT, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp, is_anonymous: true })}.faux`;
};
const subOf = (req) => {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub ?? null;
  } catch {
    return null;
  }
};
const userOf = (id) => ({
  id,
  aud: 'authenticated',
  role: 'authenticated',
  is_anonymous: true,
  app_metadata: { provider: 'anonymous', providers: [] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
});
const session = (id) => ({
  access_token: jwt(id),
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: `r.${id}`,
  user: userOf(id),
});

const stats = { rpc: 0, errors: 0 };

async function rpc(sub, fn, args) {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw Object.assign(new Error('fonction inconnue'), { status: 404 });
  const names = Object.keys(args);
  const params = names.map((n, i) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(n)) throw new Error('paramètre invalide');
    return `${n} => $${i + 1}`;
  });
  const values = names.map((n) => {
    const v = args[n];
    return v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [sub ? JSON.stringify({ sub, role: 'authenticated' }) : '']);
    await tx.exec(sub ? 'set local role authenticated' : 'set local role anon');
    const rows = (await tx.query(`select public.${fn}(${params.join(', ')}) as r`, values)).rows;
    return rows[0]?.r ?? null;
  });
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204);
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  try {
    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const id = randomUUID();
      await db.query('insert into auth.users (id) values ($1)', [id]);
      return send(res, 200, session(id));
    }
    if (url.pathname === '/auth/v1/token') {
      const id = String(body.refresh_token ?? '').replace(/^r\./, '');
      return send(res, 200, session(id));
    }
    if (url.pathname === '/auth/v1/user') {
      const id = subOf(req);
      return id ? send(res, 200, userOf(id)) : send(res, 401, { message: 'non connecté' });
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204);
    if (url.pathname.startsWith('/rest/v1/rpc/') && req.method === 'POST') {
      stats.rpc++;
      const result = await rpc(subOf(req), url.pathname.slice('/rest/v1/rpc/'.length), body);
      return send(res, 200, result);
    }
    // Outils réservés aux tests
    if (url.pathname === '/__test/sql' && req.method === 'POST') {
      return send(res, 200, (await db.query(body.sql, body.params ?? [])).rows);
    }
    if (url.pathname === '/__test/stats') return send(res, 200, stats);
    return send(res, 404, { message: `Inconnu : ${url.pathname}` });
  } catch (e) {
    stats.errors++;
    return send(res, e.status ?? 400, { code: e.code ?? 'P0001', message: e.message, details: null, hint: null });
  }
});

// Pas de temps réel : on refuse proprement les WebSocket.
server.on('upgrade', (_req, socket) => socket.destroy());

// Chrono serveur (équivalent de la tâche pg_cron)
setInterval(() => {
  db.query('select public._tick_all()').catch((e) => console.error('tick', e.message));
}, 1000);

server.listen(PORT, () => console.log(`Faux Supabase prêt sur http://localhost:${PORT}`));
