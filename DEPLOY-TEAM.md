# 📱 Deploy para Mostrar ao Time - Passo a Passo

## 🎯 Método MAIS RÁPIDO: Render.com (5 minutos)

### ✅ Passo 1: Prepare o Código

1. **Baixe o arquivo** `scrum-maturity-dashboard.tar.gz`
2. **Extraia** em uma pasta
3. **Crie repositório GitHub**:
   ```bash
   cd scrum-maturity-dashboard
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create scrum-dashboard --public --source=. --push
   ```
   
   Ou faça upload manual:
   - Vá em https://github.com/new
   - Crie repo "scrum-dashboard"
   - Faça push do código

---

### ✅ Passo 2: Deploy no Render

1. **Acesse**: https://render.com
2. **Crie conta gratuita** (pode usar GitHub)
3. **Click em "New +"** → **"Web Service"**

4. **Conecte GitHub**:
   - Autorize Render a acessar seus repos
   - Selecione o repo "scrum-dashboard"

5. **Configure o serviço**:
   ```
   Name: scrum-dashboard
   Region: Oregon (ou mais próximo)
   Branch: main
   Root Directory: (DEIXE EM BRANCO)
   Runtime: Node
   
   Build Command:
   npm install && cd server && npm install && cd ../client && npm install && cd .. && cd client && npm run build
   
   Start Command:
   cd server && NODE_ENV=production node src/index.js
   
   Instance Type: Free
   ```

6. **Adicione variáveis de ambiente**:
   - Click "Advanced" → "Add Environment Variable"
   - Adicione:
     ```
     NODE_ENV = production
     ```

7. **Click "Create Web Service"**

8. **Aguarde 5-10 minutos** (primeira build demora)

9. **Copie sua URL**:
   ```
   https://scrum-dashboard-xxxx.onrender.com
   ```

---

### ✅ Passo 3: Teste

1. Abra a URL no navegador
2. **Primeira carga pode levar 30-60s** (normal no plano free)
3. Insira:
   - URL do Jira: `https://sua-empresa.atlassian.net`
   - Email
   - API Token (criar em: https://id.atlassian.com/manage-profile/security/api-tokens)

---

### ✅ Passo 4: Compartilhe com Time

Envie mensagem:
```
🎉 Dashboard de Maturidade Scrum está no ar!

Acesse: https://scrum-dashboard-xxxx.onrender.com

Como usar:
1. Entre com suas credenciais do Jira
2. Selecione os times que quer analisar
3. Veja métricas e nível de maturidade

Precisa de API token? 
https://id.atlassian.com/manage-profile/security/api-tokens

⚠️ Primeira carga pode levar 1 minuto
```

---

## 🚀 Alternativa: Deploy Separado (Mais Rápido)

### Backend no Render:

```
Root Directory: server
Build: npm install
Start: npm start
```

URL: `https://api-scrum.onrender.com`

### Frontend na Vercel:

1. Edite `client/src/services/api.js`:
   ```javascript
   const API_BASE_URL = 'https://api-scrum.onrender.com/api';
   ```

2. Deploy:
   ```bash
   cd client
   npm run build
   npx vercel --prod
   ```

---

## 📊 Vantagens do Render (Tudo em Um)

✅ **Uma URL só** (mais fácil compartilhar)
✅ **Setup único** (não precisa configurar CORS)
✅ **Gratuito** (750 horas/mês = 24/7)
✅ **HTTPS automático**
✅ **Auto-deploy** (push GitHub = deploy automático)

---

## ⚡ Troubleshooting

### "Service Unavailable"
- Normal nos primeiros 30-60s (backend acordando)
- Recarregue a página

### Build falha no Render
- Verifique logs no Dashboard
- Confirme que `package.json` está correto
- Use Node 18+ na configuração

### CORS Error
- Já configurado! Se ocorrer, verifique URL no `api.js`

---

## 💡 Dicas

### Manter Backend Ativo:
Use **UptimeRobot** (gratuito):
1. https://uptimerobot.com
2. Crie monitor HTTP(S)
3. URL: `https://sua-url.onrender.com/health`
4. Intervalo: 5 minutos
5. Pronto! Backend nunca dorme

### Custom Domain (Opcional):
No Render Dashboard:
- Settings → Custom Domain
- Adicione: `dashboard.suaempresa.com`
- Configure DNS (instruções na tela)

---

## 🎯 Pronto!

Seu time agora tem acesso a:
- ✅ Dashboard profissional
- ✅ Métricas em tempo real
- ✅ Classificação de maturidade
- ✅ Gráficos interativos
- ✅ Totalmente gratuito

---

Dúvidas? Veja os outros arquivos:
- `DEPLOY-QUICK.md` - Comandos rápidos
- `DEPLOY.md` - Guia completo detalhado
- `README.md` - Documentação técnica
