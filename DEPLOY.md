# 🚀 DEPLOY — PROMORAR

Guia de deploy do sistema Promorar.

---

## 🔄 Deploy automático

```bash
git push origin main
# CI/CD GitHub Actions faz tudo
```

Acompanhar:
```bash
gh run list --repo Gjr1980/telemim --limit 1
gh run watch
```

---

## 🆘 Deploy manual (emergência)

```bash
cd telemim
npm run build    # vite build → cria dist/
npx wrangler pages deploy dist \
  --project-name telemim \
  --commit-dirty=true \
  --commit-message="deploy manual"
```

---

## 🔙 Rollback

### Cloudflare Pages
1. https://dash.cloudflare.com → Pages → telemim → Deployments
2. Encontre o deploy anterior
3. **Rollback to this deployment**

### Git revert
```bash
git revert HEAD
git push origin main
```

---

## 🚢 Deploy de Edge Function

Via Supabase Dashboard (Edge Functions → função → Deploy new version)
ou Supabase CLI:
```bash
supabase functions deploy <nome> --project-ref netoufukpmmfhzwirogi
```

---

## 🔐 Secrets

### GitHub Actions (https://github.com/Gjr1980/telemim/settings/secrets/actions)
- `CF_API_TOKEN`
- `CF_ACCOUNT_ID` = `040f34260d24785847f815bf297e8f78`

### Supabase Edge Functions
- `EVOLUTION_URL`, `EVOLUTION_KEY`, `EVOLUTION_INSTANCE` (com fallback)

---

## 🧪 Checklist pós-deploy

- [ ] https://telemim.pages.dev abre em aba anônima
- [ ] Login admin funciona
- [ ] DevTools sem erro vermelho
- [ ] Sentry sem novos issues

---

**Última atualização:** 2026-05-26
