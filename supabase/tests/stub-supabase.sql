-- Reproduction minimale de l'environnement Supabase, UNIQUEMENT pour les tests
-- (ne pas exécuter dans Supabase : ces objets y existent déjà).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, is_anonymous boolean not null default true);

-- Comme dans Supabase : l'identifiant de l'utilisateur vient du jeton (JWT) de la requête.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase accorde par défaut tous les droits sur les nouveaux objets du schéma public :
-- les migrations doivent donc retirer elles-mêmes ce qui ne doit pas être permis.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
