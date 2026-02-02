# 🚀 Quick Start Guide

## Pré-requisitos

- Node.js 18+ instalado
- Acesso a uma instância Jira Cloud
- API Token do Jira (veja como criar abaixo)

## Setup em 5 passos

### 1️⃣ Clone/Baixe o projeto

```bash
cd scrum-maturity-dashboard
```

### 2️⃣ Instale dependências

```bash
npm run install-all
```

Isso instalará todas as dependências do servidor e cliente.

### 3️⃣ Configure credenciais Jira

**Opção A: Via Interface (Recomendado)**
- Você inserirá as credenciais diretamente na aplicação web

**Opção B: Via .env (Opcional)**
```bash
cd server
cp .env.example .env
# Edite .env com suas credenciais
```

### 4️⃣ Execute o projeto

```bash
# Na raiz do projeto
npm run dev
```

Aguarde as mensagens:
- ✅ Server running on port 3001
- ✅ Client running on port 3000

### 5️⃣ Acesse a aplicação

Abra no navegador: **http://localhost:3000**

## 🔑 Como obter API Token do Jira

1. Acesse: https://id.atlassian.com/manage-profile/security/api-tokens
2. Clique em **"Create API token"**
3. Dê um nome (ex: "Scrum Dashboard")
4. Clique em **"Create"**
5. **Copie o token** (você não poderá vê-lo novamente!)
6. Cole na interface da aplicação

## 📋 Fluxo de uso

1. **Conectar**: Insira URL do Jira + Email + API Token
2. **Selecionar Times**: Marque os boards que deseja analisar
3. **Analisar**: Clique em "Analyze Selected Teams"
4. **Explorar**: Veja dashboards, métricas e nível de maturidade

## ⚠️ Troubleshooting

### Erro: "Cannot find module"
```bash
npm run install-all
```

### Erro: "Port 3000 already in use"
```bash
# Mude a porta em client/vite.config.js
server: { port: 3002 }
```

### Erro: "Failed to connect to Jira"
- ✅ Verifique URL (deve incluir https://)
- ✅ Confirme que API token está correto
- ✅ Certifique-se que tem permissões no Jira

## 📊 Exemplo de URL Jira

✅ Correto: `https://sua-empresa.atlassian.net`  
❌ Errado: `sua-empresa.atlassian.net` (sem https)  
❌ Errado: `https://sua-empresa.atlassian.net/` (barra no final)

## 💡 Dicas

- Para melhores resultados, analise times com **6+ sprints fechados**
- Story points devem estar preenchidos
- Issues devem ter descrições (para backlog health)
- Links para fix versions/goals melhoram análise

## 🎯 Próximos passos

Após ver o dashboard:
1. Identifique o nível de maturidade do time
2. Leia as recomendações específicas
3. Foque em melhorar 1-2 métricas por vez
4. Re-analise após alguns sprints

---

Precisa de ajuda? Veja o [README.md](README.md) completo.
