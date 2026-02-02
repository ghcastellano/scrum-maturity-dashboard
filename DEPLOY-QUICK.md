# ⚡ Deploy Rápido - 5 Minutos

## Passo 1: GitHub (2 min)

```bash
# No terminal, dentro da pasta do projeto:
./setup-git.sh

# Ou manualmente:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/seu-repo.git
git push -u origin main
```

## Passo 2: Render (3 min)

1. Acesse: **https://render.com** → Conecte GitHub
2. **New +** → **Web Service** → Selecione seu repositório
3. Configuração:
   ```
   Name: scrum-maturity-dashboard
   Build: npm install && cd server && npm install && cd ../client && npm install && npm run build
   Start: cd server && npm start
   ```
4. **Advanced** → Add Environment Variables:
   - `NODE_ENV` = `production`
   - `PORT` = `10000`
5. **Create Web Service**

## Passo 3: Compartilhar ✅

URL gerada: `https://seu-app.onrender.com`

**Primeira vez**: Aguarde ~30 segundos (cold start)

---

## 🎯 Ou use Railway (ainda mais fácil!)

1. Acesse: https://railway.app
2. **Start a New Project** → **Deploy from GitHub repo**
3. Selecione repositório → Deploy automaticamente! 🚀
4. Configura tudo sozinho (detecta Node.js)

---

**Dúvidas?** Veja [DEPLOY.md](DEPLOY.md) completo.
