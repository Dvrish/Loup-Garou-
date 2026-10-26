// Banc d'essai : un vrai PostgreSQL (PGlite) avec les migrations du projet.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..');
const stub = readFileSync(join(DIR, 'tests', 'stub-supabase.sql'), 'utf8');
const migrations = readdirSync(join(DIR, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(DIR, 'migrations', f), 'utf8'));

export type Row = Record<string, any>;

export class Db {
  private constructor(public pg: PGlite) {}

  static async create() {
    const pg = new PGlite();
    await pg.exec(stub);
    for (const m of migrations) await pg.exec(m);
    return new Db(pg);
  }

  /** Requête en administrateur (contourne RLS : réservé à la préparation et aux vérifications). */
  async admin<T extends Row = Row>(sql: string, params: unknown[] = []) {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  /** Requête au nom d'un joueur connecté, exactement comme depuis le navigateur. */
  async as<T extends Row = Row>(uid: string | null, sql: string, params: unknown[] = []) {
    return this.pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '']);
      await tx.exec(uid ? 'set local role authenticated' : 'set local role anon');
      return (await tx.query<T>(sql, params)).rows;
    });
  }

  /** Appelle une fonction RPC (comme supabase.rpc) et renvoie sa valeur. */
  async rpc<T = unknown>(uid: string | null, fn: string, args: unknown[] = []): Promise<T> {
    const params = args.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await this.as(uid, `select public.${fn}(${params}) as r`, args);
    return rows[0].r as T;
  }

  /** Comme rpc, mais renvoie le message d'erreur (ou null si l'appel a réussi). */
  async rpcError(uid: string | null, fn: string, args: unknown[] = []) {
    try {
      await this.rpc(uid, fn, args);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  async newUser() {
    const [{ id }] = await this.admin<{ id: string }>('insert into auth.users (id) values (gen_random_uuid()) returning id');
    return id;
  }

  /** Fait comme si le chrono de la phase était écoulé. */
  async expire(game: string) {
    await this.admin(`update games set phase_ends_at = now() - interval '1 second' where id = $1`, [game]);
  }
}
