# ⚡ Deploy SUPER RÁPIDO - GitHub Pages (5 minutos)

A opção MAIS FÁCIL! GitHub hospeda o frontend GRATUITAMENTE.

## 🎯 Vantagens

- ✅ 100% Gratuito (sem limitações)
- ✅ Sempre rápido (sem cold start)
- ✅ Deploy automático
- ✅ HTTPS incluído
- ✅ Zero configuração extra

---

## 📋 Passos (5 minutos)

### 1️⃣ Criar Repositório (1 min)

```bash
# Extraia o projeto baixado
cd scrum-maturity-dashboard

git init
git add .
git commit -m "Initial commit"
git branch -M main

# Criar repo no GitHub: https://github.com/new
# Depois:
git remote add origin https://github.com/SEU-USUARIO/scrum-maturity-dashboard.git
git push -u origin main
```

### 2️⃣ Ativar GitHub Pages (30 segundos)

1. No GitHub, vá em **Settings** do repositório
2. Menu lateral: **Pages**
3. **Source**: GitHub Actions
4. Pronto! (não precisa configurar mais nada)

### 3️⃣ Deploy Backend no Render (3 min)

1. Acesse: https://render.com
2. **New +** → **Web Service**
3. Conecte seu repo `scrum-maturity-dashboard`
4. Configure:
   ```
   Name: scrum-maturity-api
   Build: cd server && npm install
   Start: cd server && npm start
   Env vars:
     NODE_ENV = production
     PORT = 10000
   ```
5. **Create**
6. Copie a URL: `https://scrum-maturity-api.onrender.com`

### 4️⃣ Configurar URL do Backend (30 segundos)

1. GitHub → Seu repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**:
   - Name: `VITE_API_URL`
   - Value: `https://scrum-maturity-api.onrender.com/api`
3. **Add secret**

### 5️⃣ Disparar Deploy (30 segundos)

```bash
# Fazer qualquer mudança
echo "" >> README.md

# Push
git add .
git commit -m "Trigger deployment"
git push
```

Ou no GitHub: **Actions** → **Deploy to GitHub Pages** → **Run workflow**

---

## 🎉 Pronto!

### Sua URL será:

```
https://SEU-USUARIO.github.io/scrum-maturity-dashboard/
```

**Demora ~2-3 minutos** para o primeiro deploy.

### Ver Status

GitHub → **Actions** → Ver workflow rodando

### Quando terminar:

✅ Seu link estará no ar!  
🔗 Compartilhe com seu time: `https://SEU-USUARIO.github.io/scrum-maturity-dashboard/`

---

## 🔄 Deploy Automático

De agora em diante:
```bash
git push → Deploy automático → ✅ Atualizado!
```

---

## 📊 Comparação de Opções

| | GitHub Pages | Vercel | Render Full |
|---|---|---|---|
| **Setup** | ⚡⚡⚡⚡⚡ | ⚡⚡⚡⚡ | ⚡⚡⚡ |
| **Grátis** | ✅ Sim | ✅ Sim | ✅ Sim |
| **Velocidade** | ⚡⚡⚡⚡ | ⚡⚡⚡⚡⚡ | ⚡⚡⚡ |
| **Deploy Auto** | ✅ Sim | ✅ Sim | ✅ Sim |
| **Cold Start** | ❌ Não | ❌ Não | ⚠️ Sim (15min) |
| **Limite** | Sem limite | 100GB/mês | 750h/mês |

**Recomendação**: GitHub Pages + Render = Melhor custo/benefício! 🎯

---

## 🐛 Troubleshooting

### Workflow falhou
- Veja logs em: Actions → Click no workflow
- Verifique se `VITE_API_URL` está configurado

### Página 404
- Aguarde 2-3 minutos após primeiro deploy
- Confirme que GitHub Pages está ativado em Settings

### Frontend não conecta ao backend
- Teste backend: `https://seu-backend.onrender.com/health`
- Verifique se `VITE_API_URL` termina com `/api`

---

## ✅ Checklist

- [ ] Código no GitHub
- [ ] GitHub Pages ativado
- [ ] Backend no Render deployado
- [ ] VITE_API_URL configurado
- [ ] Workflow executado
- [ ] URL funcionando
- [ ] Link compartilhado 🎉

---

## 🎯 URL Final

```
Frontend: https://SEU-USUARIO.github.io/scrum-maturity-dashboard/
Backend:  https://scrum-maturity-api.onrender.com

Compartilhe apenas o frontend!
```

**Tempo total**: ~5 minutos ⏱️  
**Custo**: R$ 0,00 💰  
**Manutenção**: Zero! 🎉
