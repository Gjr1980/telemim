# 🆘 TROUBLESHOOTING — PROMORAR

Guia de solução de problemas comuns.

---

## 📱 WhatsApp não envia

### Checklist

1. **Número está com 11 dígitos?** (DDD + 9 + 8)
2. **Tem WhatsApp ativo?** Testa no seu celular adicionando o contato
3. **Evolution API responde?**
   ```bash
   curl -X POST "https://netoufukpmmfhzwirogi.supabase.co/functions/v1/enviar-whatsapp" \
     -H "Content-Type: application/json" \
     -H "apikey: <SUPA_KEY>" \
     -d '{"numero":"<numero>","mensagem":"teste"}'
   ```
4. **Configs Evolution OK?**
   ```sql
   SELECT chave, valor FROM configuracoes
   WHERE chave IN ('whatsapp_ativo','evolution_api_url','evolution_api_key','evolution_instance');
   ```

### Restaurar configs (se zeradas)
```sql
UPDATE configuracoes SET valor='http://64.181.190.173:8080' WHERE chave='evolution_api_url';
UPDATE configuracoes SET valor='B6D711FCDE4D4FD5936544120E713976' WHERE chave='evolution_api_key';
UPDATE configuracoes SET valor='telemim' WHERE chave='evolution_instance';
```

---

## 🔒 Login não funciona

1. Usuário existe e ativo?
   ```sql
   SELECT id, nome, email, ativo FROM usuarios WHERE email='<email>';
   ```
2. Senha resetada? Supabase → Auth → Users → **Send password recovery**
3. Cache → `Cmd + Shift + R`

---

## ❌ Tela branca

1. DevTools → Console — erro vermelho?
2. Sentry — novo issue?
3. Service Worker → DevTools → Application → Storage → **Clear site data**
4. Hard reload (`Cmd + Shift + R`)

---

## 💾 Restaurar backup

```sql
-- Listar
SELECT id, executado_em, rows_count, tamanho_kb, sucesso
FROM backup_historico
WHERE sucesso=true
ORDER BY executado_em DESC LIMIT 30;

-- Pegar dados de uma tabela
SELECT dados_backup -> 'agenda' FROM backup_historico WHERE id='<uuid>';
```

---

## 🔍 Sentry — debugar erro

🔗 https://telemim.sentry.io → Issues → filtra `release:telemim@*`

Com GitHub conectado, clica no erro → vê código fonte real do `App.jsx`.

**Session Replay:** vídeo dos últimos 30s antes do erro.

---

## 🚦 Deploy falhou

1. https://github.com/Gjr1980/telemim/actions → run com falha → ler erro
2. **500 Cloudflare:** rerun (`gh run rerun <id>`)
3. **Build falhou:** verificar sintaxe / package-lock
4. **401 Cloudflare:** token expirou — gerar novo

---

## 📡 Realtime não atualiza

1. Tabela está na publicação?
   ```sql
   SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';
   ```
2. Adicionar:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE agenda;
   ```

---

## 📞 Suporte

1. Coleta evidências (screenshot, URL, hora, ID)
2. Consulta logs:
   - Supabase → Logs → Edge Functions / Postgres
   - Cloudflare Pages → Deployments
   - Sentry → Issues
3. `git log --oneline -10` — algum deploy recente?

---

**Última atualização:** 2026-05-26
