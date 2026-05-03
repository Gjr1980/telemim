-- =============================================
-- TELEMIM RLS Migration — Phase B
-- Date: 2026-04-30
-- =============================================
-- IMPORTANT: Run inside a transaction so we can rollback if anything fails
BEGIN;

-- 1. Helper function: returns the perfil of the currently authenticated user
CREATE OR REPLACE FUNCTION public.user_perfil()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT perfil FROM public.usuarios WHERE id = auth.uid()
$$;

-- =============================================
-- 2. DROP all existing permissive "open" policies
-- =============================================

-- MUDANCAS
DROP POLICY IF EXISTS "public_all_mudancas" ON public.mudancas;
DROP POLICY IF EXISTS "anon_read_backup" ON public.mudancas;
DROP POLICY IF EXISTS "anon_update_pdf_backup" ON public.mudancas;

-- AGENDA
DROP POLICY IF EXISTS "public_all_agenda" ON public.agenda;
DROP POLICY IF EXISTS "anon_read_backup" ON public.agenda;
DROP POLICY IF EXISTS "usuarios_podem_atualizar_agenda" ON public.agenda;
DROP POLICY IF EXISTS "usuarios_podem_inserir_agenda" ON public.agenda;
DROP POLICY IF EXISTS "usuarios_podem_ler_agenda" ON public.agenda;

-- CUSTOS_DIARIOS
DROP POLICY IF EXISTS "public_all_custos" ON public.custos_diarios;
DROP POLICY IF EXISTS "anon_read_backup" ON public.custos_diarios;

-- CONTAS_PAGAR
DROP POLICY IF EXISTS "allow_all" ON public.contas_pagar;

-- CONTAS_SEMANA
DROP POLICY IF EXISTS "admin_all_contas_semana" ON public.contas_semana;
DROP POLICY IF EXISTS "anon_read_contas_semana" ON public.contas_semana;

-- BACKUP_HISTORICO
DROP POLICY IF EXISTS "anon_all_backup_historico" ON public.backup_historico;

-- PRESTADORES
DROP POLICY IF EXISTS "prestadores_select" ON public.prestadores;
DROP POLICY IF EXISTS "prestadores_insert" ON public.prestadores;
DROP POLICY IF EXISTS "prestadores_update" ON public.prestadores;
DROP POLICY IF EXISTS "prestadores_delete" ON public.prestadores;

-- EMAIL_NOTIFICACOES
DROP POLICY IF EXISTS "service_role_all" ON public.email_notificacoes;

-- CONFIGURACOES (drop all, recreate properly)
DROP POLICY IF EXISTS "anon_update_configuracoes" ON public.configuracoes;
DROP POLICY IF EXISTS "admin_edita_config" ON public.configuracoes;
DROP POLICY IF EXISTS "auth_le_config" ON public.configuracoes;

-- =============================================
-- 3. CREATE new restrictive policies
-- =============================================

-- ─── MUDANCAS ────────────────────────────────────────
-- SELECT: all authenticated
CREATE POLICY "auth_select_mudancas" ON public.mudancas
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: all authenticated (motorista can initiate moves)
CREATE POLICY "auth_insert_mudancas" ON public.mudancas
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: admin, promorar, social (approve, edit fields)
CREATE POLICY "role_update_mudancas" ON public.mudancas
  FOR UPDATE TO authenticated
  USING (public.user_perfil() IN ('admin', 'promorar', 'social'))
  WITH CHECK (public.user_perfil() IN ('admin', 'promorar', 'social'));

-- DELETE: admin only
CREATE POLICY "admin_delete_mudancas" ON public.mudancas
  FOR DELETE TO authenticated
  USING (public.user_perfil() = 'admin');

-- ─── AGENDA ──────────────────────────────────────────
-- SELECT: all authenticated
CREATE POLICY "auth_select_agenda" ON public.agenda
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: admin, promorar, social
CREATE POLICY "role_insert_agenda" ON public.agenda
  FOR INSERT TO authenticated
  WITH CHECK (public.user_perfil() IN ('admin', 'promorar', 'social'));

-- UPDATE: admin, promorar, social
CREATE POLICY "role_update_agenda" ON public.agenda
  FOR UPDATE TO authenticated
  USING (public.user_perfil() IN ('admin', 'promorar', 'social'))
  WITH CHECK (public.user_perfil() IN ('admin', 'promorar', 'social'));

-- DELETE: admin only
CREATE POLICY "admin_delete_agenda" ON public.agenda
  FOR DELETE TO authenticated
  USING (public.user_perfil() = 'admin');

-- ─── CUSTOS_DIARIOS ─────────────────────────────────
-- ALL: admin only
CREATE POLICY "admin_all_custos_diarios" ON public.custos_diarios
  FOR ALL TO authenticated
  USING (public.user_perfil() = 'admin')
  WITH CHECK (public.user_perfil() = 'admin');

-- ─── CONTAS_PAGAR ───────────────────────────────────
-- ALL: admin only
CREATE POLICY "admin_all_contas_pagar" ON public.contas_pagar
  FOR ALL TO authenticated
  USING (public.user_perfil() = 'admin')
  WITH CHECK (public.user_perfil() = 'admin');

-- ─── CONTAS_SEMANA ──────────────────────────────────
-- ALL: admin only
CREATE POLICY "admin_all_contas_semana_v2" ON public.contas_semana
  FOR ALL TO authenticated
  USING (public.user_perfil() = 'admin')
  WITH CHECK (public.user_perfil() = 'admin');

-- ─── PRESTADORES ────────────────────────────────────
-- SELECT: all authenticated
CREATE POLICY "auth_select_prestadores" ON public.prestadores
  FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: admin only
CREATE POLICY "admin_insert_prestadores" ON public.prestadores
  FOR INSERT TO authenticated
  WITH CHECK (public.user_perfil() = 'admin');

CREATE POLICY "admin_update_prestadores" ON public.prestadores
  FOR UPDATE TO authenticated
  USING (public.user_perfil() = 'admin')
  WITH CHECK (public.user_perfil() = 'admin');

CREATE POLICY "admin_delete_prestadores" ON public.prestadores
  FOR DELETE TO authenticated
  USING (public.user_perfil() = 'admin');

-- ─── CONFIGURACOES ──────────────────────────────────
-- SELECT: all authenticated (app needs to read config)
CREATE POLICY "auth_select_config" ON public.configuracoes
  FOR SELECT TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: admin only
CREATE POLICY "admin_insert_config" ON public.configuracoes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_perfil() = 'admin');

CREATE POLICY "admin_update_config" ON public.configuracoes
  FOR UPDATE TO authenticated
  USING (public.user_perfil() = 'admin')
  WITH CHECK (public.user_perfil() = 'admin');

CREATE POLICY "admin_delete_config" ON public.configuracoes
  FOR DELETE TO authenticated
  USING (public.user_perfil() = 'admin');

-- ─── EMAIL_NOTIFICACOES ─────────────────────────────
-- SELECT: admin only
CREATE POLICY "admin_select_email_notif" ON public.email_notificacoes
  FOR SELECT TO authenticated
  USING (public.user_perfil() = 'admin');

-- INSERT: any authenticated (edge functions / system inserts)
CREATE POLICY "auth_insert_email_notif" ON public.email_notificacoes
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE/DELETE: admin only
CREATE POLICY "admin_update_email_notif" ON public.email_notificacoes
  FOR UPDATE TO authenticated
  USING (public.user_perfil() = 'admin');

CREATE POLICY "admin_delete_email_notif" ON public.email_notificacoes
  FOR DELETE TO authenticated
  USING (public.user_perfil() = 'admin');

-- ─── BACKUP_HISTORICO ───────────────────────────────
-- SELECT: admin only
CREATE POLICY "admin_select_backup" ON public.backup_historico
  FOR SELECT TO authenticated
  USING (public.user_perfil() = 'admin');

-- INSERT: any authenticated (system creates backups)
CREATE POLICY "auth_insert_backup" ON public.backup_historico
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE/DELETE: admin only
CREATE POLICY "admin_update_backup" ON public.backup_historico
  FOR UPDATE TO authenticated
  USING (public.user_perfil() = 'admin');

CREATE POLICY "admin_delete_backup" ON public.backup_historico
  FOR DELETE TO authenticated
  USING (public.user_perfil() = 'admin');

-- ─── USUARIOS (already good, keep existing) ─────────
-- Existing policies are correct:
--   usuario_le_proprio (SELECT WHERE auth.uid() = id)
--   usuario_atualiza_proprio (UPDATE WHERE auth.uid() = id)
--   usuario_insere_proprio (INSERT WHERE auth.uid() = id)

-- ─── PUSH_SUBSCRIPTIONS (already good, keep existing) ─
-- Existing policy is correct:
--   usuario_gerencia_propria_sub (ALL WHERE auth.uid() = usuario_id)

-- ─── AUDITORIA (already good, keep existing) ────────
-- Existing policies are correct:
--   admin_le_auditoria (SELECT for admin only)
--   auth_insere_auditoria (INSERT for any auth)

-- ─── LEMBRETES_ENVIADOS (already good, keep existing) ─
-- Existing policies are correct:
--   admin_le_lembretes (SELECT for admin only)
--   sistema_insere_lembretes (INSERT for any)

COMMIT;
