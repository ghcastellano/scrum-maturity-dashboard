# Auto-Login Configuration

## Como configurar credenciais automáticas

Para que a aplicação pule a tela de login no primeiro acesso e vá direto para a seleção de times:

### 1. Configure o arquivo `.env` na pasta `client`

Edite o arquivo `/client/.env` e adicione suas credenciais:

```bash
VITE_JIRA_URL=https://indeed.atlassian.net/
VITE_JIRA_EMAIL=seu.email@indeed.com
VITE_JIRA_API_TOKEN=seu_token_aqui
```

### 2. Como obter o API Token

1. Acesse https://id.atlassian.com/manage-profile/security/api-tokens
2. Clique em "Create API token"
3. Dê um nome (ex: "Scrum Dashboard")
4. Copie o token gerado

### 3. Reinicie o servidor de desenvolvimento

```bash
cd client
npm run dev
```

## Como funciona

1. **Primeiro acesso (sem localStorage):**
   - Se as 3 variáveis de ambiente estiverem configuradas, a app pula a tela de conexão
   - Vai direto para a tela de seleção de times
   - Salva as credenciais no localStorage para próximos acessos

2. **Acessos subsequentes:**
   - Usa as credenciais salvas no localStorage
   - Vai direto para o dashboard com os times já selecionados
   - Não mostra a tela de conexão

3. **Sem configuração:**
   - Se as variáveis de ambiente não estiverem configuradas
   - Mostra a tela de conexão normalmente
   - Usuário precisa inserir credenciais manualmente

## Segurança

⚠️ **IMPORTANTE:**
- Nunca commite o arquivo `.env` com credenciais reais
- O `.env` já está no `.gitignore`
- Use `.env.example` como referência para documentação
- Em produção, configure as variáveis de ambiente no Vercel/Netlify/etc

## Limpando o localStorage

Se precisar fazer logout ou reconfigurar:

1. Clique no botão "Disconnect" no dashboard
2. Ou abra o DevTools do navegador:
   ```javascript
   localStorage.clear()
   ```

## Deployment em Produção

No GitHub Pages ou outro hosting estático:

1. Configure as variáveis de ambiente no painel do hosting
2. Formato: `VITE_JIRA_URL`, `VITE_JIRA_EMAIL`, `VITE_JIRA_API_TOKEN`
3. Faça rebuild da aplicação após configurar

### GitHub Pages com GitHub Actions

Adicione secrets no repositório:
- Settings → Secrets and variables → Actions → New repository secret
- Adicione: `VITE_JIRA_EMAIL` e `VITE_JIRA_API_TOKEN`
- Atualize o workflow para passar essas variáveis no build
