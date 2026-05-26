# 🚛 PROMORAR — Sistema de Gestão de Mudanças

Sistema web para gestão operacional de mudanças do contrato Promorar.
Desenvolvido em React + Supabase + Cloudflare Pages.

🌐 **Produção:** https://telemim.pages.dev

---

## 📋 Sumário

- [Arquitetura](#-arquitetura)
- [Setup local](#-setup-local)
- [Deploy](DEPLOY.md)
- [Segurança](SECURITY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Perfis de usuário](#-perfis-de-usuário)
- [Edge Functions](#-edge-functions)

---

## 🏗️ Arquitetura

```
┌──────────────────┐       ┌─────────────────────┐
│  Cloudflare Pages│  ←──→ │   GitHub Actions    │
│  (frontend SPA)  │       │   (CI/CD deploy)    │
└──────────────────┘       └─────────────────────┘
        │
        ↓
┌─────────────────────────────────────────────┐
│  Supabase                                   │
│  ├─ PostgreSQL (dados)                      │
│  ├─ Auth (login + JWT)                      │
│  ├─ Edge Functions (Deno)                   │
│  ├─ Storage (canhotos PDF)                  │
│  └─ Realtime (WebSocket)                    │
└─────────────────────────────────────────────┘
        │
        ↓
┌──────────────────┐
│  Evolution API   │  (servidor compartilhado com URB)
│  (WhatsApp)      │  → 64.181.190.173:8080
└──────────────────┘
```

### Stack técnico
- **Frontend:** React 18 + JSX (single file App.jsx) + Vite bundler
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **Hosting:** Cloudflare Pages
- **WhatsApp:** Evolution API (instância `telemim`)
- **Monitoramento:** Sentry com Session Replay
- **CI/CD:** GitHub Actions

---

## 🚀 Setup local

```bash
git clone https://github.com/Gjr1980/telemim.git
cd telemim
npm install
npm run dev   # http://localhost:5173
npm run build # build de produção
```

Credenciais em:
- `src/config/supabase.js`
- `index.html` (Sentry DSN)

---

## 👥 Perfis de usuário

| Perfil | O que faz |
|---|---|
| **admin** | Acesso total |
| **promorar** | Gestão do contrato |
| **supervisor** | Vê sua equipe |
| **motorista** | Vê só suas mudanças |
| **social** | Acompanha terceirizadas |
| **coordenador** | Acompanhamento operacional |

---

## 🔧 Edge Functions

Em **Supabase Project `netoufukpmmfhzwirogi`** → Edge Functions.

Principais:
- `criar-usuario`, `editar-usuario`, `deletar-usuario`, `listar-usuarios`
- `enviar-whatsapp`, `enviar-whatsapp-auto`
- `gerar-link-mudanca`, `gerar-magic-link`
- `consumir-magic-link`, `consumir-link-mudanca`
- `atualizar-status-terceirizado`
- `salvar-canhoto` (Supabase Storage)
- `enviar-email-agendamento`
- `lembrete-d1`, `lembrete-diario` (cron)
- `traccar-position` (GPS)
- `backup-diario` (cron 06:15 UTC)

> ⚠️ Tem ~25 funções órfãs (fix-*, patch-*, deploy-*) — limpar futuramente.

---

## 💾 Backups

- **Diário automático** às 03:15 BRT (06:15 UTC)
- Snapshot de 17 tabelas → `backup_historico`
- Retenção 30 dias

---

## 🔗 Recursos

| | Link |
|---|---|
| 📦 Repositório | https://github.com/Gjr1980/telemim |
| 🌐 Produção | https://telemim.pages.dev |
| 🚀 Cloudflare Pages | https://dash.cloudflare.com → Pages → telemim |
| 🗄️ Supabase | https://supabase.com/dashboard/project/netoufukpmmfhzwirogi |
| 📊 Sentry | https://telemim.sentry.io → Projects → telemim-promorar |
| 📱 Evolution API | http://64.181.190.173:8080 |
| 📦 Sistema irmão | [URB](https://github.com/Gjr1980/telemim-urb) |

---

**Última atualização:** 2026-05-26
