# 🚛 TELEMIM — App Web

## Deploy na Vercel via GitHub

### Passo 1 — Upload no GitHub
1. Crie conta em github.com
2. New repository → Nome: `telemim` → Public → Create
3. Clique **"uploading an existing file"**
4. Extraia o ZIP e arraste **TODOS os arquivos e pastas** para o GitHub:
   - `index.html`, `package.json`, `vite.config.js`, `vercel.json`, `.gitignore`
   - pasta `src/` (com `App.jsx` e `main.jsx`)
   - pasta `public/` (com `manifest.json`)
   - pasta `.github/` (com `workflows/deploy.yml`)
5. Commit changes

### Passo 2 — Deploy na Vercel
1. Acesse vercel.com → Sign up with GitHub
2. New Project → Selecione `telemim`
3. **Framework Preset → Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Clique **Deploy** ✅

### Passo 3 — Instalar no celular
- Android: Chrome → ⋮ → "Adicionar à tela inicial"
- iPhone: Safari → □↑ → "Adicionar à Tela de Início"
