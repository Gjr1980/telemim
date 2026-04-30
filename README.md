# 🚛 TELEMIM — App Web

App PWA para gestão de mudanças. React + Vite + Supabase.

## Stack

- **Frontend:** React 18 + Vite
- **Backend:** Supabase (PostgreSQL + Realtime)
- **Hosting:** Cloudflare Pages (deploy automático via GitHub)

## Estrutura

```
telemim/
├── App.jsx           # Componente principal (toda a aplicação)
├── main.jsx          # Entry point (monta React no DOM)
├── index.html        # HTML raiz
├── manifest.json     # PWA manifest
├── public/           # Assets estáticos
├── vite.config.js    # Config Vite
└── package.json
```

## Desenvolvimento local

```bash
# Instalar dependências
npm install

# Rodar dev server (http://localhost:5173)
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

## Deploy

Push para a branch `main` → Cloudflare Pages faz deploy automático em `https://telemim.pages.dev`.

- **Build command:** `npm run build`
- **Output directory:** `dist`

## Instalação como PWA no celular

- **Android:** Chrome → ⋮ → "Adicionar à tela inicial"
- **iPhone:** Safari → □↑ → "Adicionar à Tela de Início"
