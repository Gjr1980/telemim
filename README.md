# TELEMIM — Gestão de Mudanças

App PWA para gestão de mudanças residenciais. React + Vite + Supabase + Cloudflare Pages.

## Stack

- **Frontend:** React 18 + Vite (SPA de ficheiro único `App.jsx`)
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Hosting:** Cloudflare Pages (deploy automático via GitHub)
- **Produção:** https://telemim.pages.dev

## Estrutura

```
telemim/
├── App.jsx           # Aplicação completa (~2700 linhas)
├── main.jsx          # Entry point React
├── index.html        # HTML raiz
├── manifest.json     # PWA manifest
├── vite.config.js    # Config Vite
├── package.json      # Dependências (react, supabase-js)
├── public/
│   ├── icons/        # Ícones PWA (192px, 512px)
│   ├── manifest.json # PWA manifest (cópia)
│   └── sw.js         # Service Worker
└── backup_*/         # Backups locais (não commitados)
```

## Perfis de usuário

| Perfil | Permissões |
|---|---|
| **admin** | Acesso total: mudanças, agenda, custos, contas, configurações, usuários |
| **promorar** | Lê mudanças/agenda, aprova como promorar, edita |
| **social** | Lê mudanças/agenda, aprova como social |
| **motorista** | Lê mudanças/agenda, inicia mudanças |

## Tabelas Supabase (TELEMIM)

`mudancas`, `agenda`, `custos_diarios`, `contas_pagar`, `contas_semana`, `configuracoes`, `prestadores`, `usuarios`, `push_subscriptions`, `auditoria`, `lembretes_enviados`, `email_notificacoes`, `backup_historico`

Todas com RLS ativado e políticas por perfil.

## Desenvolvimento local

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # Build de produção → dist/
npm run preview   # Preview do build
```

## Deploy

Push para `main` → Cloudflare Pages faz deploy automático.

- **Build command:** `npm run build`
- **Output directory:** `dist`

## PWA — Instalar no celular

- **Android:** Chrome → ⋮ → "Adicionar à tela inicial"
- **iPhone:** Safari → □↑ → "Adicionar à Tela de Início"
