# 🚀 Deploy no Vercel - Guia Completo (5 Minutos)

## 📦 PASSO 1: Preparar Código no GitHub (2 min)

### Opção A: Upload Manual (Mais Fácil)
1. Acesse: **https://github.com/new**
2. Nome do repositório: `scrum-maturity-dashboard`
3. **Público** ou **Privado** (ambos funcionam)
4. **NÃO marque** "Initialize with README"
5. Clique em **"Create repository"**
6. Na página seguinte, você verá instruções
7. **Baixe o arquivo ZIP** que forneci
8. Extraia os arquivos
9. No terminal, dentro da pasta extraída:

```bash
git init
git add .
git commit -m "Initial commit - Scrum Maturity Dashboard"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/scrum-maturity-dashboard.git
git push -u origin main
```

### Opção B: GitHub Desktop (Sem Terminal)
1. Baixe GitHub Desktop: https://desktop.github.com
2. Instale e faça login
3. File → Add Local Repository → Selecione pasta extraída
4. Publish repository

---

## 🎨 PASSO 2: Deploy Frontend no Vercel (2 min)

### 2.1 Criar Conta
1. Acesse: **https://vercel.com**
2. Clique em **"Sign Up"**
3. **"Continue with GitHub"** (recomendado)
4. Autorize Vercel no GitHub

### 2.2 Deploy do Frontend
1. No dashboard do Vercel, clique em **"Add New..."**
2. Selecione **"Project"**
3. Clique em **"Import Git Repository"**
4. Selecione `scrum-maturity-dashboard`
5. **Configure o projeto:**

```
Framework Preset: Vite
Root Directory: client (IMPORTANTE!)
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

6. Clique em **"Deploy"**
7. ⏱️ Aguarde ~2 minutos
8. ✅ Quando terminar, você verá: "Congratulations!"

### 2.3 Copiar URL do Frontend
- Anote a URL gerada: `https://seu-projeto.vercel.app`

---

## 🔌 PASSO 3: Deploy Backend no Render (2 min)

### 3.1 Criar Conta no Render
1. Acesse: **https://render.com**
2. **"Get Started"**
3. **"Continue with GitHub"**

### 3.2 Deploy do Backend
1. Dashboard → **"New +"** → **"Web Service"**
2. **"Connect a repository"**
3. Selecione `scrum-maturity-dashboard`
4. **Configure:**

```
Name: scrum-maturity-api
Region: Oregon (US West)
Branch: main
Root Directory: (deixe vazio)
Runtime: Node
Build Command: cd server && npm install
Start Command: cd server && npm start
Instance Type: Free
```

5. **Environment Variables** → **"Add Environment Variable"**:
   - Key: `NODE_ENV` → Value: `production`
   - Key: `PORT` → Value: `10000`

6. **"Create Web Service"**
7. ⏱️ Aguarde ~5 minutos
8. ✅ Quando ver "Live", está pronto!

### 3.3 Copiar URL do Backend
- Anote: `https://scrum-maturity-api.onrender.com`

---

## 🔗 PASSO 4: Conectar Frontend ao Backend (1 min)

### 4.1 Configurar URL da API no Vercel
1. Volte para o dashboard do **Vercel**
2. Clique no seu projeto
3. **"Settings"** → **"Environment Variables"**
4. **"Add New"**:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://scrum-maturity-api.onrender.com/api`
   (use a URL que você anotou do Render, adicione `/api` no final)
5. **"Save"**

### 4.2 Redeploy
1. Vá para **"Deployments"**
2. Clique nos 3 pontinhos do deployment mais recente
3. **"Redeploy"**
4. ⏱️ Aguarde ~1 minuto

---

## 🎉 PASSO 5: Testar e Compartilhar!

### 5.1 Sua aplicação está em:
```
🌐 Frontend: https://seu-projeto.vercel.app
🔌 Backend: https://scrum-maturity-api.onrender.com
```

### 5.2 Testar
1. Acesse a URL do Vercel
2. Cole URL do seu Jira Cloud
3. Insira email e API token
4. Teste a conexão!

### 5.3 Compartilhar com Time
**Envie apenas**: `https://seu-projeto.vercel.app`

Cada pessoa precisará:
- URL Jira Cloud da empresa
- Email corporativo
- API Token próprio (criar em: https://id.atlassian.com/manage-profile/security/api-tokens)

---

## ✅ Checklist Final

- [ ] Código no GitHub
- [ ] Frontend deployado no Vercel
- [ ] Backend deployado no Render
- [ ] Variável VITE_API_URL configurada
- [ ] Redeploy feito após adicionar variável
- [ ] Testado com Jira
- [ ] URL compartilhada com time ✨

---

## 🐛 Problemas Comuns

### "Failed to fetch" ou CORS error
**Solução:**
1. Verifique se `VITE_API_URL` está correta no Vercel
2. Confirme que adicionou `/api` no final
3. Teste o backend direto: `https://seu-backend.onrender.com/health`

### Backend não responde
**Solução:**
- Primeiro acesso é lento (~30s cold start)
- Aguarde e tente novamente

### Deploy falhou no Vercel
**Solução:**
1. Verifique se Root Directory = `client`
2. Confirme Build Command = `npm run build`
3. Tente fazer redeploy

### Deploy falhou no Render
**Solução:**
1. Veja os logs no dashboard
2. Confirme Environment Variables
3. Manual Deploy em Settings

---

## 📊 URLs de Monitoramento

**Vercel:**
- Dashboard: https://vercel.com/dashboard
- Ver logs: Projeto → Deployments → Click no deployment
- Analytics: Projeto → Analytics

**Render:**
- Dashboard: https://dashboard.render.com
- Ver logs: Seu serviço → Logs (tempo real)
- Métricas: Seu serviço → Metrics

---

## 🔄 Atualizar Aplicação

Sempre que fizer mudanças:

```bash
git add .
git commit -m "Descrição da mudança"
git push
```

- **Vercel**: Deploy automático (~1 min) ⚡
- **Render**: Deploy automático (~5 min) 🔄

---

## 💰 Custos

**Vercel Free Tier:**
- ✅ Deploy ilimitado
- ✅ 100GB bandwidth/mês
- ✅ Sempre rápido

**Render Free Tier:**
- ✅ 750 horas/mês
- ⚠️ Sleep após 15min inatividade
- ✅ Suficiente para uso interno

**Total:** 🆓 GRÁTIS!

---

## 🎯 URLs Finais

Após concluir todos os passos, anote aqui:

```
Frontend (Vercel): https://_____________________.vercel.app
Backend (Render):  https://_____________________.onrender.com
```

**Link para compartilhar com time:** (apenas o Frontend)
```
🔗 https://_____________________.vercel.app
```

---

## 🆘 Precisa de Ajuda?

- 📖 Docs Vercel: https://vercel.com/docs
- 📖 Docs Render: https://render.com/docs
- 💬 Render Support: https://render.com/docs/support

---

**🎉 Parabéns! Sua aplicação está no ar!**

Tempo total: ~10 minutos ⏱️
Custo: R$ 0,00 💰
