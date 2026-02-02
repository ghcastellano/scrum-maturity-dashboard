# 🚀 Guia de Deploy - Escolha Sua Opção

O projeto está configurado para deploy automático via GitHub! Escolha a opção que preferir:

---

## ⚡ Opção 1: GitHub Pages (MAIS FÁCIL) - 5 MIN

✅ **Melhor para**: Primeira vez, demonstrações, uso interno  
✅ **Vantagens**: Setup mínimo, 100% gratuito, sem cold start  
⚠️ **Desvantagem**: URL um pouco mais longa  

**📖 Guia**: [DEPLOY-GITHUB-PAGES.md](DEPLOY-GITHUB-PAGES.md)

**Passos resumidos:**
1. Push código para GitHub (1 min)
2. Ativar GitHub Pages em Settings (30 seg)
3. Deploy backend no Render (3 min)
4. Configurar secret VITE_API_URL (30 seg)
5. ✅ Pronto!

**URL final**: `https://seu-usuario.github.io/scrum-maturity-dashboard/`

---

## ⚡ Opção 2: GitHub Actions + Vercel - 10 MIN

✅ **Melhor para**: URL customizada, máxima performance  
✅ **Vantagens**: Deploy mais rápido, URL curta e bonita  
⚠️ **Desvantagem**: Mais passos de configuração  

**📖 Guia**: [DEPLOY-GITHUB-ACTIONS.md](DEPLOY-GITHUB-ACTIONS.md)

**Passos resumidos:**
1. Push código para GitHub
2. Criar projeto no Vercel
3. Pegar Token, Org ID e Project ID
4. Configurar 4 secrets no GitHub
5. Deploy backend no Render
6. ✅ Pronto!

**URL final**: `https://seu-projeto.vercel.app`

---

## ⚡ Opção 3: Deploy Manual via CLI - 5 MIN

✅ **Melhor para**: Você já tem Vercel CLI instalado  
✅ **Vantagens**: Controle total, não depende do GitHub  
⚠️ **Desvantagem**: Manual (não automático)  

**📖 Guia**: [DEPLOY-CLI.md](DEPLOY-CLI.md)

**Passos resumidos:**
```bash
vercel login
cd client
vercel --prod
# Configurar backend no Render
vercel env add VITE_API_URL production
vercel --prod
```

**URL final**: `https://seu-projeto.vercel.app`

---

## ⚡ Opção 4: Script Automático - 5 MIN

✅ **Melhor para**: Preguiçosos (eu!) 😄  
✅ **Vantagens**: Script faz quase tudo  
⚠️ **Desvantagem**: Precisa de Node/Git local  

**Script**: [deploy-auto.sh](deploy-auto.sh)

```bash
chmod +x deploy-auto.sh
./deploy-auto.sh
# Siga as instruções
```

---

## 🎯 Recomendação por Cenário

| Situação | Opção Recomendada |
|----------|-------------------|
| **Primeira vez / Rápido** | 🥇 GitHub Pages |
| **Produção / Time grande** | 🥇 GitHub Actions + Vercel |
| **Já uso Vercel CLI** | 🥇 Deploy Manual |
| **Quero automação completa** | 🥇 GitHub Actions |
| **Não quero instalar nada** | 🥇 GitHub Pages |
| **URL bonita importante** | 🥇 Vercel |

---

## 📊 Comparação Detalhada

| Critério | GitHub Pages | Vercel + Actions | CLI Manual |
|----------|--------------|------------------|------------|
| **Tempo de Setup** | 5 min | 10 min | 5 min |
| **Complexidade** | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Deploy Automático** | ✅ | ✅ | ❌ |
| **URL Curta** | ❌ | ✅ | ✅ |
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Custo** | 🆓 | 🆓 | 🆓 |
| **Manutenção** | Zero | Zero | Manual |

---

## 🎬 Começar Agora

### Se você tem 5 minutos:
👉 Use **GitHub Pages**: [DEPLOY-GITHUB-PAGES.md](DEPLOY-GITHUB-PAGES.md)

### Se você quer o melhor:
👉 Use **GitHub Actions + Vercel**: [DEPLOY-GITHUB-ACTIONS.md](DEPLOY-GITHUB-ACTIONS.md)

### Se você já usa Vercel:
👉 Use **CLI**: [DEPLOY-CLI.md](DEPLOY-CLI.md)

---

## 🆘 Precisa de Ajuda?

Cada guia tem seção de troubleshooting detalhada!

- GitHub Pages: Seção "Troubleshooting" em DEPLOY-GITHUB-PAGES.md
- Vercel: Seção "Troubleshooting" em DEPLOY-GITHUB-ACTIONS.md
- CLI: Seção "Troubleshooting" em DEPLOY-CLI.md

---

## ✅ Checklist Geral

Independente da opção escolhida:

- [ ] Código no GitHub
- [ ] Frontend deployado
- [ ] Backend no Render
- [ ] URLs conectadas
- [ ] Testado com Jira
- [ ] Link compartilhado com time 🎉

---

## 🎯 Próximos Passos

Após deploy:

1. **Teste**: Acesse sua URL e conecte com Jira
2. **Compartilhe**: Envie o link para seu time
3. **Monitore**: Use dashboards do Vercel/Render/GitHub
4. **Atualize**: Basta fazer `git push`!

---

## 📚 Documentação Completa

- [README.md](README.md) - Documentação técnica do projeto
- [QUICKSTART.md](QUICKSTART.md) - Como rodar localmente
- [DEPLOY.md](DEPLOY.md) - Guia de deploy geral

---

**🎉 Escolha sua opção e comece agora!**

Tempo estimado: 5-10 minutos ⏱️  
Custo: R$ 0,00 💰  
Resultado: Aplicação no ar! 🚀
