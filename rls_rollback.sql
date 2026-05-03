-- =============================================
-- TELEMIM RLS ROLLBACK — restore previous open policies
-- Use this ONLY if the migration breaks the app
-- =============================================
BEGIN;

-- Drop new policies
DROP POLICY IF EXISTS "auth_select_mudancas" ON public.mudancas;
DROP POLICY IF EXISTS "auth_insert_mudancas" ON public.mudancas;
DROP POLICY IF EXISTS "role_update_mudancas" ON public.mudancas;
DROP POLICY IF EXISTS "admin_delete_mudancas" ON public.mudancas;

DROP POLICY IF EXISTS "auth_select_agenda" ON public.agenda;
DROP POLICY IF EXISTS "role_insert_agenda" ON public.agenda;
DROP POLICY IF EXISTS "role_update_agenda" ON public.agenda;
DROP POLICY IF EXISTS "admin_delete_agenda" ON public.agenda;

DROP POLICY IF EXISTS "admin_all_custos_diarios" ON public.custos_diarios;
DROP POLICY IF EXISTS "admin_all_contas_pagar" ON public.contas_pagar;
DROP POLICY IF EXISTS "admin_all_contas_semana_v2" ON public.contas_semana;

DROP POLICY IF EXISTS "auth_select_prestadores" ON public.prestadores;
DROP POLICY IF EXISTS "admin_insert_prestadores" ON public.prestadores;
DROP POLICY IF EXISTS "admin_update_prestadores" ON public.prestadores;
DROP POLICY IF EXISTS "admin_delete_prestadores" ON public.prestadores;

DROP POLICY IF EXISTS "auth_select_config" ON public.configuracoes;
DROP POLICY IF EXISTS "admin_insert_config" ON public.configuracoes;
DROP POLICY IF EXISTS "admin_update_config" ON public.configuracoes;
DROP POLICY IF EXISTS "admin_delete_config" ON public.configuracoes;

DROP POLICY IF EXISTS "admin_select_email_notif" ON public.email_notificacoes;
DROP POLICY IF EXISTS "auth_insert_email_notif" ON public.email_notificacoes;
DROP POLICY IF EXISTS "admin_update_email_notif" ON public.email_notificacoes;
DROP POLICY IF EXISTS "admin_delete_email_notif" ON public.email_notificacoes;

DROP POLICY IF EXISTS "admin_select_backup" ON public.backup_historico;
DROP POLICY IF EXISTS "auth_insert_backup" ON public.backup_historico;
DROP POLICY IF EXISTS "admin_update_backup" ON public.backup_historico;
DROP POLICY IF EXISTS "admin_delete_backup" ON public.backup_historico;

-- Drop helper function
DROP FUNCTION IF EXISTS public.user_perfil();

-- Restore original open policies
CREATE POLICY "public_all_mudancas" ON public.mudancas FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_backup" ON public.mudancas FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_pdf_backup" ON public.mudancas FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "public_all_agenda" ON public.agenda FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_backup" ON public.agenda FOR SELECT TO anon USING (true);
CREATE POLICY "usuarios_podem_atualizar_agenda" ON public.agenda FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "usuarios_podem_inserir_agenda" ON public.agenda FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "usuarios_podem_ler_agenda" ON public.agenda FOR SELECT TO anon USING (true);

CREATE POLICY "public_all_custos" ON public.custos_diarios FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_backup" ON public.custos_diarios FOR SELECT TO anon USING (true);

CREATE POLICY "allow_all" ON public.contas_pagar FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "admin_all_contas_semana" ON public.contas_semana FOR ALL TO public USING (auth.role() = 'authenticated') WITH CHECK (NULL);
CREATE POLICY "anon_read_contas_semana" ON public.contas_semana FOR ALL TO public USING (true) WITH CHECK (NULL);

CREATE POLICY "anon_all_backup_historico" ON public.backup_historico FOR ALL TO public USING (true) WITH CHECK (NULL);

CREATE POLICY "prestadores_select" ON public.prestadores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "prestadores_insert" ON public.prestadores FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "prestadores_update" ON public.prestadores FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "prestadores_delete" ON public.prestadores FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "service_role_all" ON public.email_notificacoes FOR ALL TO public USING (true) WITH CHECK (NULL);

CREATE POLICY "anon_update_configuracoes" ON public.configuracoes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_edita_config" ON public.configuracoes FOR ALL TO public USING (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.perfil = 'admin'));
CREATE POLICY "auth_le_config" ON public.configuracoes FOR SELECT TO public USING (auth.uid() IS NOT NULL);

COMMIT;
