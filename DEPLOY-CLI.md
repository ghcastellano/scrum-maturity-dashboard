# 🚀 Deploy Manual via CLI - Vercel + Render

Como você já tem conta no Vercel, use estes comandos na sua máquina:

## 📋 Pré-requisitos

```bash
# Instalar Vercel CLI (se não tiver)
npm install -g vercel

# Verificar instalação
vercel --version
```

## 🎯 Comandos para Deploy

### 1️⃣ Preparar Git (se ainda não fez)

```bash
cd scrum-maturity-dashboard

git init
git add .
git commit -m "Initial commit"
git branch -M main

# Criar repo no GitHub e depois:
git remote add origin https://github.com/SEU-USUARIO/scrum-maturity-dashboard.git
git push -u origin main
```

### 2️⃣ Deploy Frontend no Vercel

```bash
# Fazer login (abre navegador)
vercel login

# Ir para pasta do cliente
cd client

# Deploy
vercel --prod

# Anotar URL gerada (ex: https://scrum-maturity-dashboard.vercel.app)
```

### 3️⃣ Deploy Backend no Render (Manual)

**Via Dashboard Render:**

1. Acesse: https://dashboard.render.com
2. **New +** → **Web Service**
3. Conecte repositório GitHub
4. Configure:
   ```
   Name: scrum-maturity-api
   Build Command: cd server && npm install
   Start Command: cd server && npm start
   Environment Variables:
     - NODE_ENV = production
     - PORT = 10000
   ```
5. **Create Web Service**
6. Aguarde deploy (~5 min)
7. Anote URL (ex: https://scrum-maturity-api.onrender.com)

### 4️⃣ Conectar Frontend ao Backend

```bash
# Voltar para pasta do client
cd client

# Adicionar variável de ambiente
vercel env add VITE_API_URL production

# Quando solicitar valor, cole:
# https://scrum-maturity-api.onrender.com/api
# (substitua pela SUA URL do Render + /api no final)

# Redeploy com nova variável
vercel --prod
```

### 5️⃣ Testar

```bash
# Abrir no navegador
vercel open
```

## ✅ Resultado Final

Você terá:
- ✅ Frontend: `https://seu-projeto.vercel.app`
- ✅ Backend: `https://seu-api.onrender.com`

**Compartilhe apenas a URL do frontend com seu time!**

## 🔄 Atualizar Deploy

```bash
# Após fazer mudanças
git add .
git commit -m "Update"
git push

# Redeploy frontend
cd client
vercel --prod
```

Backend no Render faz redeploy automático ao detectar push no GitHub.

## 🐛 Troubleshooting

### Erro de autenticação Vercel
```bash
vercel logout
vercel login
```

### Ver logs do Vercel
```bash
vercel logs
```

### Remover projeto e recomeçar
```bash
vercel remove
```

## 📝 Comandos Úteis

```bash
# Ver projetos
vercel list

# Ver deployments
vercel ls

# Ver logs
vercel logs

# Abrir dashboard
vercel dashboard

# Ver configurações
vercel env ls
```

---

## ⚡ Atalho: Script Automático

Ou use o script automatizado:

```bash
chmod +x deploy-auto.sh
./deploy-auto.sh
```

O script faz tudo automaticamente e te guia pelos passos!
