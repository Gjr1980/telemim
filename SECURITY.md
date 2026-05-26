# 🔐 SECURITY — PROMORAR

Documento de segurança do sistema Promorar.

---

## 🛡️ Camadas de segurança

1. **HTTPS** (Cloudflare)
2. **JWT** (Supabase Auth)
3. **RLS** com `user_perfil()` (RBAC real implementado)
4. **Edge Functions** com whitelist de campos
5. **Magic Links** com expiração

---

## 🔑 Credenciais

| Credencial | Onde está | Sensibilidade |
|---|---|---|
| `SUPA_KEY` (anon) | `src/config/supabase.js` | 🟢 Pública (RLS protege) |
| `SUPA_KEY` (service_role) | Supabase Dashboard | 🔴 NUNCA expor |
| `CF_API_TOKEN` | GitHub Secrets | 🔴 NUNCA expor |
| `EVOLUTION_KEY` | Edge Function secrets + fallback | 🟡 Mover pra secrets |
| `SENTRY_DSN` | `index.html` | 🟢 Pública |

---

## 🛂 RLS

### Estado atual: RBAC implementado
Diferente do URB (que está em Phase A), o Promorar já tem RLS role-based usando `user_perfil()`:

- `auth_select_agenda` — motorista vê só sua mudança, supervisor sua equipe, admin tudo
- `role_update_agenda` — mesma lógica para UPDATE
- `admin_delete_*` — só admin pode deletar
- `admin_all_pagamentos`, `admin_all_contas_pagar` — financeiro só admin
- `usuario_le_proprio` — usuário só vê próprio cadastro
- etc.

### Função helper `user_perfil()`
Lê o perfil do usuário logado (via `auth.uid()`) e retorna a string ('admin', 'supervisor', etc.).

---

## 🔒 Magic Links

- `?ml=token` — motorista vê rota
- `?mm=token` — assistente social acompanha mudança

Validade: até meia-noite do dia. Tokens em `magic_links`.

---

## 📋 Auditoria automática (triggers Postgres)

Tabelas com trigger:
- `agenda`, `mudancas`, `usuarios`, `pagamentos`, `contas_pagar`, `configuracoes`

Toda mudança grava em `auditoria`:
- `usuario_id`, `usuario_nome` (quem)
- `acao` (INSERT/UPDATE/DELETE)
- `tabela`, `registro_id` (o quê)
- `dados_antes`, `dados_depois` (JSONB)
- `criado_em`

### Consulta
```sql
SELECT criado_em, usuario_nome, acao, registro_id
FROM auditoria
WHERE tabela = 'agenda' AND criado_em > now() - interval '24 hours'
ORDER BY criado_em DESC;
```

---

## 🚨 Em caso de incidente

### Bloquear usuário
```sql
UPDATE usuarios SET ativo=false WHERE id='<uuid>';
```
+ Supabase Auth → Users → Logout do usuário.

### Vazamento de credencial
- **Anon key:** rotacionar (Settings → API → Reset)
- **Service role:** rotacionar IMEDIATAMENTE
- **CF Token:** rotacionar + atualizar GitHub Secret

---

**Última atualização:** 2026-05-26
