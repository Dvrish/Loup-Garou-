// Connexion au serveur Supabase.
//
// L'adresse et la clé ci-dessous sont PUBLIQUES par nature : la clé « anon » est envoyée à tous
// les navigateurs, et ce sont les règles RLS et les fonctions SQL qui protègent les données.
// Des variables d'environnement (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) peuvent les remplacer.
// Ne jamais mettre ici la clé « service_role » : elle donne tous les droits.
import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://fjpqtxtlhffjubyqogos.supabase.co';
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqcHF0eHRsaGZmanVieXFvZ29zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMzAxOTQsImV4cCI6MjEwODYwNjE5NH0.TOyMgKL2FQWCdyXmWfNmwPVx-LcX95fVUPWTSsYt1j0';

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Connexion anonyme : un compte invisible est créé au premier passage et gardé sur l'appareil. */
export async function ensureSignedIn() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signed.user!;
}

export interface CheckStep {
  label: string;
  ok: boolean | null;
  detail?: string;
}

/** Vérifie pas à pas que le serveur est prêt (utilisé par l'écran Profil). */
export async function checkServer(pseudo: string): Promise<CheckStep[]> {
  const steps: CheckStep[] = [
    { label: 'Connexion anonyme', ok: null },
    { label: 'Base de données du jeu installée', ok: null },
    { label: 'Pseudo enregistré sur le serveur', ok: null },
  ];
  try {
    await ensureSignedIn();
    steps[0].ok = true;
  } catch (e) {
    steps[0].ok = false;
    const message = (e as Error).message;
    steps[0].detail = /fetch|network/i.test(message)
      ? 'Serveur injoignable : vérifiez votre connexion Internet et l’adresse du projet.'
      : `${message} — vérifiez que « Anonymous sign-ins » est activé dans Supabase.`;
    return steps;
  }
  const { data, error } = await supabase.rpc('default_settings');
  steps[1].ok = !error && !!data;
  if (error) {
    steps[1].detail = `${error.message} — les deux fichiers SQL ont-ils été exécutés ?`;
    return steps;
  }
  const res = await supabase.rpc('set_pseudo', { p_pseudo: pseudo });
  steps[2].ok = !res.error;
  if (res.error) steps[2].detail = res.error.message;
  return steps;
}
