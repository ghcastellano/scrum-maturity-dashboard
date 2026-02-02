# 🚀 Guia de Deploy - Scrum Maturity Dashboard

Este guia mostra como fazer deploy **gratuito** da aplicação em plataformas cloud.

## 🎯 Opção Recomendada: Render (Full Stack - Mais Simples)

Deploy backend + frontend juntos no Render. **Tempo total: ~10 minutos**

---

## 📋 Passo a Passo

### 1️⃣ Criar conta no Render
1. Acesse: **https://render.com**
2. Clique em **"Get Started for Free"**
3. Conecte com GitHub ou crie conta com email

### 2️⃣ Preparar repositório GitHub
1. Crie um repositório novo no GitHub: https://github.com/new
2. Nome sugerido: `scrum-maturity-dashboard`
3. Deixe público ou privado (ambos funcionam)

No seu terminal:
```bash
cd scrum-maturity-dashboard
git init
git add .
git commit -m "Initial commit - Scrum Maturity Dashboard"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/scrum-maturity-dashboard.git
git push -u origin main
```

### 3️⃣ Deploy no Render

1. No dashboard do Render, clique em **"New +"** (canto superior direito)
2. Selecione **"Web Service"**
3. Clique em **"Connect a repository"** → Conecte seu GitHub
4. Selecione o repositório `scrum-maturity-dashboard`

### 4️⃣ Configurar o Web Service

Preencha os campos:

| Campo | Valor |
|-------|-------|
| **Name** | `scrum-maturity-dashboard` |
| **Region** | Oregon (US West) |
| **Branch** | `main` |
| **Root Directory** | *(deixe vazio)* |
| **Runtime** | Node |
| **Build Command** | `npm install && cd server && npm install && cd ../client && npm install && npm run build` |
| **Start Command** | `cd server && npm start` |
| **Instance Type** | **Free** |

### 5️⃣ Adicionar Environment Variables

Clique em **"Advanced"** → **"Add Environment Variable"**

Adicione:
- **Key**: `NODE_ENV` → **Value**: `production`
- **Key**: `PORT` → **Value**: `10000`

### 6️⃣ Criar Web Service

1. Clique em **"Create Web Service"**
2. Aguarde o deploy (~5-10 minutos)
3. Você verá logs em tempo real
4. Quando aparecer **"Live"** no canto superior, está pronto! ✅

### 7️⃣ Acessar sua aplicação

Sua URL será algo como:
```
https://scrum-maturity-dashboard.onrender.com
```

🎉 **Pronto!** Agora você pode compartilhar essa URL com seu time!

---

## 🌐 Alternativa: Deploy Separado (Render + Vercel)

Se preferir frontend e backend separados:

### Backend no Render
1. Siga passos 1-3 acima
2. No passo 4, use:
   - **Build Command**: `cd server && npm install`
   - **Start Command**: `cd server && npm start`
3. Anote a URL: `https://seu-backend.onrender.com`

### Frontend no Vercel
1. Acesse: https://vercel.com
2. Conecte com GitHub
3. Clique em **"Add New..."** → **"Project"**
4. Selecione seu repositório
5. Configure:
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Adicione Environment Variable:
   - `VITE_API_URL` = `https://seu-backend.onrender.com/api`
7. Deploy! (~2 minutos)

---

## ⚠️ Importante sobre Render Free Tier

- ✅ **750 horas/mês gratuitas** (suficiente!)
- ⚠️ **Sleep após 15 minutos** de inatividade
- 🐢 **Primeiro acesso lento** (~30 segundos para "acordar")
- ⚡ **Acessos seguintes são rápidos**

**Dica**: Abra o link alguns minutos antes de apresentar para o time!

---

## 🎬 Como Usar com seu Time

1. **Compartilhe o link**: `https://seu-app.onrender.com`

2. **Cada pessoa vai precisar**:
   - URL do Jira Cloud da empresa
   - Email corporativo
   - API Token do Jira (criar em: https://id.atlassian.com/manage-profile/security/api-tokens)

3. **Dados ficam seguros**:
   - ✅ Nada é armazenado no servidor
   - ✅ Credenciais só em memória durante sessão
   - ✅ Cada pessoa usa suas próprias credenciais

---

## 🐛 Problemas Comuns

### "Application failed to respond"
- Aguarde ~30 segundos (cold start)
- Verifique logs no dashboard do Render

### "Failed to connect to Jira"
- Verifique se API token está correto
- Confirme que tem permissões no Jira
- URL do Jira deve incluir `https://`

### Deploy falhou
- Verifique logs no Render
- Confirme que todos os arquivos foram commitados
- Tente fazer redeploy: Settings → "Manual Deploy"

---

## 🔄 Atualizar a Aplicação

Sempre que você fizer mudanças:

```bash
git add .
git commit -m "Descrição da mudança"
git push
```

O Render vai fazer **deploy automático**! 🚀

---

## 📊 Monitoramento

No dashboard do Render você pode ver:
- 📈 **Métricas** de uso
- 📝 **Logs** em tempo real  
- 🔄 **Status** da aplicação
- ⏰ **Histórico** de deploys

---

## ✅ Checklist Rápido

- [ ] Conta criada no Render
- [ ] Repositório no GitHub criado
- [ ] Código commitado e pushed
- [ ] Web Service configurado no Render
- [ ] Environment variables adicionadas
- [ ] Deploy concluído com sucesso
- [ ] Link testado e funcionando
- [ ] Compartilhado com o time 🎉

---

## 💡 Dicas Extras

1. **Personalize a URL**: Em Settings → você pode adicionar um domínio customizado
2. **Email alerts**: Configure para ser notificado se app cair
3. **Limite de uso**: Monitore em "Usage" para não exceder free tier

---

**Pronto! Sua aplicação está no ar e seu time pode começar a usar!** 🚀

Se tiver problemas, veja:
- 📖 Docs do Render: https://render.com/docs
- 💬 Support: https://render.com/docs/support
