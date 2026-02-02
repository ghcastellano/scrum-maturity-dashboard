# Scrum Maturity Dashboard

Dashboard web para análise de maturidade Scrum de times baseado em métricas do Jira Cloud.

## 📋 Funcionalidades

- **Conexão com Jira Cloud** via API REST
- **Seleção de múltiplos times** (boards)
- **Análise automatizada** de 3 pilares de maturidade:
  - 📊 **Delivery Predictability** (Previsibilidade de Entrega)
  - ⚡ **Flow & Quality** (Fluxo e Qualidade)
  - 👥 **Team Ownership** (Propriedade do Time)
- **Classificação automática** em níveis de maturidade (1-3)
- **Gráficos interativos** com métricas-chave

## 🏗️ Arquitetura

```
scrum-maturity-dashboard/
├── server/          # Backend Node.js + Express
│   └── src/
│       ├── services/      # JiraService, MetricsService
│       ├── controllers/   # API Controllers
│       └── index.js       # Entry point
└── client/          # Frontend React + Tailwind
    └── src/
        ├── components/    # React components
        ├── services/      # API client
        └── App.jsx        # Main app
```

## 🚀 Como Usar

### 1. Instalação

```bash
# Na raiz do projeto
npm run install-all
```

### 2. Configuração do Jira

Crie um API Token no Jira:
1. Acesse: https://id.atlassian.com/manage-profile/security/api-tokens
2. Clique em "Create API token"
3. Copie o token gerado

### 3. Executar o projeto

```bash
# Inicia servidor backend + frontend simultaneamente
npm run dev
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

### 4. Usar a aplicação

1. **Conectar ao Jira**:
   - Cole a URL da sua instância Jira Cloud
   - Insira seu email
   - Cole o API token

2. **Selecionar Times**:
   - Marque os boards que deseja analisar
   - Clique em "Analyze Selected Teams"

3. **Ver Dashboard**:
   - Visualize o nível de maturidade
   - Explore gráficos por pilar
   - Veja recomendações

## 📊 Métricas Calculadas

### Pillar 1: Delivery Predictability
- Sprint Goal Attainment (% de meta atingida)
- Sprint Hit Rate (% de itens completados)
- Rollover Rate (% de itens que rolaram para próximo sprint)
- Mid-Sprint Additions (adições durante sprint)

### Pillar 2: Flow & Quality
- Cycle Time por tipo de issue
- Lead Time por tipo
- Distribuição de defeitos (Pre-merge, QA, Post-release)
- WIP Aging

### Pillar 3: Team Ownership
- Backlog Health Score
- % com Acceptance Criteria
- % com Estimates
- % linkado a Goals/Releases

## 🎯 Níveis de Maturidade

O dashboard classifica automaticamente times em 3 níveis baseado nas métricas coletadas:

### 📕 Level 1: Assisted Scrum (Scrum Manager Obrigatório)

**Características típicas:**
- ❌ Rollover > 20-25%
- ❌ Sprint goals raramente atingidos (<50-60%)
- ❌ Alta injeção mid-sprint
- ❌ Taxa baixa de "Ready" no backlog
- ❌ Backlog hygiene pobre
- ❌ Rising cycle time
- ❌ Cerimônias ineficazes

**Foco do Scrum Manager:**
- Estabelecer cadência operacional básica
- Melhorar preparação do backlog
- Reduzir scope churn
- Ensinar comportamentos de ownership
- Introduzir métricas visíveis

### 📙 Level 2: Supported Scrum (Suporte Condicional)

**Características típicas:**
- ⚠️ Rollover ~10-20%
- ⚠️ Sprint goals atingidos ~60-70%
- ⚠️ Algum scope churn mas gerenciável
- ⚠️ Backlog majoritariamente saudável
- ⚠️ Flow melhorando mas inconsistente

**Modelo de Suporte:**
- Scrum Manager compartilhado
- Engajamento time-bound (1-2 sprints/mês)

**Foco do Scrum Manager:**
- Reconhecimento de padrões (rush de última hora, WIP aging)
- Coaching de Product em backlog ownership
- Habilitar cerimônias lideradas pelo time
- Conduzir execução de ações de retro

### 📗 Level 3: Self-Managed Scrum (Scrum Manager Opcional)

**Critérios de Entrada (Sustentado por 3-4 sprints):**
- ✅ Rollover médio <10-15%
- ✅ Sprint goals atingidos >70%
- ✅ Scope churn mínimo mid-sprint
- ✅ 90%+ backlog "Ready"
- ✅ Throughput estável
- ✅ Issues de qualidade em tendência de queda
- ✅ Cerimônias executadas sem dependência
- ✅ Blockers resolvidos dentro do time

**Papel do Scrum Manager:**
- Coaching on-demand
- Quarterly health check
- Escalação de padrões se houver regressão

---

**⚠️ Nota Importante sobre Rollover:**
Os thresholds de rollover podem variar baseado em processos internos de como/quando tickets são fechados dentro de um sprint. Nem todos os times seguem os mesmos passos.

## 🔧 Tecnologias

**Backend:**
- Node.js + Express
- Axios (Jira API client)
- date-fns (manipulação de datas)

**Frontend:**
- React 18
- Vite (build tool)
- Tailwind CSS
- Chart.js + react-chartjs-2

## 📝 Notas Importantes

- **Story Points Field**: O campo configurado é `customfield_10061` (Indeed Jira). Se sua instância usar outro, ajuste em `metricsService.js`.
- **Rate Limits**: Jira API tem rate limits. Para muitos boards/sprints, pode levar alguns minutos.
- **Dados Históricos**: Analisa os últimos 6 sprints fechados por padrão.

## 🔐 Segurança

- API tokens nunca são armazenados
- Todas as credenciais ficam apenas em memória durante sessão
- Comunicação via HTTPS com Jira Cloud
- CORS habilitado para desenvolvimento local

## 🐛 Troubleshooting

**Erro "Failed to connect to Jira":**
- Verifique se a URL está correta (ex: https://sua-empresa.atlassian.net)
- Confirme que o API token está válido
- Certifique-se que tem permissões no Jira

**Gráficos não aparecem:**
- Verifique console do navegador
- Confirme que os sprints têm dados (issues, story points)

**Métricas zeradas:**
- Verifique se os sprints estão marcados como "closed"
- Confirme que issues têm story points preenchidos

## 📄 Licença

MIT

## 🤝 Contribuindo

Pull requests são bem-vindos! Para mudanças grandes, abra uma issue primeiro.

---

**Criado com ❤️ para melhorar times Scrum**
