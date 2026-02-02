# 🤖 Deploy Automático via GitHub Actions

O GitHub vai fazer deploy automático para você! Basta configurar uma vez e depois é só fazer `git push`.

## 🎯 Vantagens

- ✅ Deploy automático em cada push
- ✅ Sem precisar instalar nada localmente
- ✅ Histórico de deploys no GitHub
- ✅ Gratuito (GitHub Actions free tier)

---

## 📋 Configuração (10 minutos)

### PASSO 1: Criar Projeto no Vercel (5 min)

#### 1.1 Criar Repositório no GitHub
1. Acesse: https://github.com/new
2. Nome: `scrum-maturity-dashboard`
3. Visibilidade: Público ou Privado
4. **Criar repositório**

#### 1.2 Upload do Código
```bash
# Baixe e extraia o projeto
cd scrum-maturity-dashboard

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/scrum-maturity-dashboard.git
git push -u origin main
```

#### 1.3 Criar Projeto no Vercel
1. Acesse: https://vercel.com/dashboard
2. **Add New...** → **Project**
3. **Import** seu repositório `scrum-maturity-dashboard`
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. **NÃO clique em Deploy ainda!**
6. Role até **Environment Variables** e adicione:
   - Name: `VITE_API_URL`
   - Value: `https://SEU-BACKEND.onrender.com/api` (vamos configurar depois)
7. Agora clique em **Deploy**
8. Aguarde completar (~2 min)

#### 1.4 Pegar IDs do Projeto Vercel
Após o deploy, você precisa de 3 informações:

**a) Vercel Token:**
1. Acesse: https://vercel.com/account/tokens
2. **Create Token**
3. Nome: `github-actions`
4. Scope: `Full Account`
5. **Create**
6. **Copie o token** (você não verá novamente!)

**b) Project ID e Org ID:**
1. No seu projeto Vercel, vá em **Settings**
2. No canto superior, clique em **General**
3. Role até encontrar:
   - **Project ID** (exemplo: `prj_xxxxxxxxxxxxx`)
   - Role mais até **Team ID** ou **Organization ID** (exemplo: `team_xxxxxxxxxxxxx`)
4. Copie ambos

---

### PASSO 2: Configurar GitHub Secrets (2 min)

1. No seu repositório GitHub, vá em **Settings** → **Secrets and variables** → **Actions**
2. Clique em **New repository secret** e adicione:

| Name | Value | Onde pegar |
|------|-------|------------|
| `VERCEL_TOKEN` | seu-token-aqui | Token que você criou no passo 1.4a |
| `VERCEL_ORG_ID` | team_xxxxx | Org ID do passo 1.4b |
| `VERCEL_PROJECT_ID` | prj_xxxxx | Project ID do passo 1.4b |
| `VITE_API_URL` | https://seu-backend.onrender.com/api | URL do backend (configure depois) |

**⚠️ IMPORTANTE**: Clique em **Add secret** após cada um!

---

### PASSO 3: Deploy Backend no Render (3 min)

1. Acesse: https://render.com
2. **New +** → **Web Service**
3. Conecte seu repositório GitHub `scrum-maturity-dashboard`
4. Configure:
   ```
   Name: scrum-maturity-api
   Branch: main
   Root Directory: (deixe vazio)
   Runtime: Node
   Build Command: cd server && npm install
   Start Command: cd server && npm start
   Instance Type: Free
   ```
5. **Environment Variables**:
   - `NODE_ENV` = `production`
   - `PORT` = `10000`
6. **Create Web Service**
7. Aguarde (~5 min)
8. **Copie a URL** gerada (ex: `https://scrum-maturity-api.onrender.com`)

---

### PASSO 4: Atualizar URL do Backend no GitHub (1 min)

1. Volte para seu repositório GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Edite o secret **VITE_API_URL**
4. Cole a URL do Render + `/api`:
   ```
   https://scrum-maturity-api.onrender.com/api
   ```
5. **Update secret**

---

### PASSO 5: Fazer Redeploy (1 min)

Agora vamos disparar o GitHub Actions:

```bash
# Faça uma pequena mudança
echo "" >> README.md

# Commit e push
git add .
git commit -m "Trigger deployment"
git push
```

Ou clique em **Actions** no GitHub → **Deploy Frontend (Vercel CLI)** → **Run workflow**

---

## 🎉 Pronto! Deploy Automático Funcionando

### Ver Status do Deploy

1. No GitHub, vá em **Actions**
2. Você verá o workflow rodando
3. Clique para ver logs em tempo real
4. Quando terminar (✅ verde), está deployado!

### Suas URLs

```
Frontend: https://seu-projeto.vercel.app
Backend:  https://seu-backend.onrender.com
```

**Compartilhe apenas a URL do frontend!**

---

## 🔄 Como Funciona Agora

Sempre que você fizer `git push`:
1. ✅ GitHub Actions detecta push
2. ✅ Instala dependências
3. ✅ Build do frontend
4. ✅ Deploy automático no Vercel
5. ✅ URL atualizada!

Backend no Render também faz redeploy automático!

---

## 🐛 Troubleshooting

### Workflow falhou com erro "Invalid token"
- Verifique se `VERCEL_TOKEN` está correto
- Crie um novo token se necessário

### Workflow falhou com "Project not found"
- Verifique `VERCEL_PROJECT_ID` e `VERCEL_ORG_ID`
- Confirme que copiou os valores corretos

### Frontend não conecta ao backend
- Verifique se `VITE_API_URL` termina com `/api`
- Confirme que backend está rodando: acesse `https://seu-backend.onrender.com/health`

### Como ver logs do GitHub Actions
1. GitHub → Actions → Click no workflow
2. Click no job "Deploy to Vercel"
3. Expanda cada step para ver logs

---

## 📊 Monitoramento

### GitHub Actions
- **Free tier**: 2.000 minutos/mês
- Cada deploy: ~2-3 minutos
- Suficiente para ~600 deploys/mês

### Vercel
- Deploy ilimitado
- 100GB bandwidth/mês

### Render
- 750 horas/mês
- Sleep após 15min inatividade

**Tudo grátis! 🎉**

---

## 🎯 Comandos Úteis

### Disparar deploy manual
```bash
# Via GitHub web
Actions → Deploy Frontend → Run workflow
```

### Ver histórico de deploys
```bash
# GitHub
Actions → Ver todos os workflows

# Vercel
Dashboard → Seu projeto → Deployments
```

### Desabilitar auto-deploy
```bash
# Renomear workflow
mv .github/workflows/deploy-vercel-cli.yml .github/workflows/deploy-vercel-cli.yml.disabled
git commit -m "Disable auto-deploy"
git push
```

---

## ✅ Checklist Final

- [ ] Repositório GitHub criado
- [ ] Código pushed
- [ ] Projeto criado no Vercel
- [ ] Vercel Token gerado
- [ ] Project ID e Org ID copiados
- [ ] GitHub Secrets configurados
- [ ] Backend deployado no Render
- [ ] VITE_API_URL atualizado
- [ ] Workflow executado com sucesso
- [ ] URLs testadas e funcionando
- [ ] Link compartilhado com time 🎉

---

## 🚀 Resultado

Agora você tem **CI/CD completo**:

```
git push → GitHub Actions → Deploy Automático → ✅ No Ar!
```

**Tempo total de setup**: ~10 minutos  
**Tempo de deploy futuro**: Automático! ⚡
