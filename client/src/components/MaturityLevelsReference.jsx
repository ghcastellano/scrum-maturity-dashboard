export default function MaturityLevelsReference({ locale = 'en', t }) {
  const isPtBR = locale === 'pt-BR';

  const levels = [
    {
      level: 1,
      name: t ? t('level1Name') : 'Assisted Scrum',
      desc: t ? t('level1Desc') : 'Scrum Manager Required',
      border: 'border-red-300', bg: 'bg-red-50', badge: 'bg-red-600',
      title: 'text-red-900', subtitle: 'text-red-700', text: 'text-red-800', divider: 'border-red-300',
      characteristics: [
        { label: isPtBR ? 'Rollover' : 'Rollover', value: '> 20-25%' },
        { label: isPtBR ? 'Injecao Mid-Sprint' : 'Mid-Sprint Injection', value: isPtBR ? 'Alta (subjetivo)' : 'High (subjective measure)' },
        { label: isPtBR ? 'Taxa de "Pronto"' : '"Ready" Rate', value: isPtBR ? 'Baixa (<25% dos tickets prontos)' : 'Low (<25% of tickets are ready)' },
        { label: isPtBR ? 'Higiene do Backlog' : 'Backlog Hygiene', value: isPtBR ? 'Ruim' : 'Poor' },
        { label: isPtBR ? 'Cycle Time' : 'Dev Cycle Time', value: isPtBR ? 'Crescente' : 'Rising' },
      ],
      focus: {
        label: isPtBR ? 'Foco do Scrum Manager' : 'Scrum Manager Focus',
        items: isPtBR
          ? ['Estabelecer cadencia operacional basica', 'Melhorar prontidao do backlog e planejamento de capacidade', 'Reduzir mudancas de escopo', 'Coaching de comportamentos de ownership', 'Introduzir metricas e padroes visiveis']
          : ['Establish basic operating cadence', 'Improve backlog readiness and capacity planning', 'Reduce scope churn', 'Coach ownership behaviors', 'Introduce visible metrics and patterns']
      }
    },
    {
      level: 2,
      name: t ? t('level2Name') : 'Supported Scrum',
      desc: t ? t('level2Desc') : 'Conditional Support',
      border: 'border-yellow-300', bg: 'bg-yellow-50', badge: 'bg-yellow-600',
      title: 'text-yellow-900', subtitle: 'text-yellow-700', text: 'text-yellow-800', divider: 'border-yellow-300',
      characteristics: [
        { label: isPtBR ? 'Rollover' : 'Rollover', value: '~10-20%' },
        { label: isPtBR ? 'Mudanca de Escopo' : 'Scope Churn', value: isPtBR ? 'Alguma, mas gerenciavel' : 'Some but manageable' },
        { label: isPtBR ? 'Saude do Backlog' : 'Backlog Health', value: isPtBR ? 'Geralmente saudavel (25-75% prontos)' : 'Mostly healthy (25-75% ready)' },
        { label: isPtBR ? 'Fluxo' : 'Flow', value: isPtBR ? 'Melhorando mas inconsistente' : 'Improving but inconsistent' },
      ],
      focus: {
        label: isPtBR ? 'Foco do Scrum Manager' : 'Scrum Manager Focus',
        items: isPtBR
          ? ['Reconhecimento de padroes (correria de ultima hora, WIP envelhecido)', 'Coaching de Product em ownership do backlog', 'Habilitando cerimonias lideradas pelo time', 'Conduzindo execucao de acoes da retro']
          : ['Pattern recognition (last-minute rush, WIP aging)', 'Coaching Product on backlog ownership', 'Enabling team-led ceremonies', 'Driving retro action execution']
      },
      support: isPtBR
        ? 'Scrum Manager compartilhado, engajamento por tempo limitado (1-2 sprints/mes)'
        : 'Shared Scrum Manager, Time-bound engagement (1-2 sprints/month)'
    },
    {
      level: 3,
      name: t ? t('level3Name') : 'Self-Managed Scrum',
      desc: t ? t('level3Desc') : 'Scrum Manager Optional',
      border: 'border-green-300', bg: 'bg-green-50', badge: 'bg-green-600',
      title: 'text-green-900', subtitle: 'text-green-700', text: 'text-green-800', divider: 'border-green-300',
      characteristics: [
        { label: isPtBR ? 'Rollover Medio' : 'Avg Rollover', value: '< 10-15%' },
        { label: isPtBR ? 'Mudanca Mid-Sprint' : 'Mid-Sprint Churn', value: isPtBR ? 'Minima' : 'Minimal' },
        { label: isPtBR ? 'Backlog "Pronto"' : 'Backlog "Ready"', value: isPtBR ? 'Quase tudo (+75% prontos)' : 'Almost all (+75% ready)' },
        { label: isPtBR ? 'Throughput' : 'Throughput', value: isPtBR ? 'Estavel' : 'Stable' },
        { label: isPtBR ? 'Qualidade' : 'Quality Issues', value: isPtBR ? 'Tendencia de queda' : 'Trending down' },
        { label: isPtBR ? 'Cerimonias' : 'Ceremonies', value: isPtBR ? 'Funcionam sem dependencia' : 'Run without dependency' },
        { label: isPtBR ? 'Bloqueios' : 'Blockers', value: isPtBR ? 'Resolvidos dentro do time' : 'Resolved within the team' },
      ],
      focus: {
        label: isPtBR ? 'Papel do Scrum Manager' : 'Scrum Manager Role',
        items: isPtBR
          ? ['Coaching sob demanda', 'Verificacao de saude trimestral', 'Check-in com stakeholders/produto', 'Escalacao de padroes se houver regressao']
          : ['On-demand coaching', 'Quarterly health check', 'Stakeholder/product check in', 'Pattern escalation if regression occurs']
      }
    }
  ];

  return (
    <div className="card mb-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        {isPtBR ? '📖 Referencia de Niveis de Maturidade' : '📖 Maturity Levels Reference'}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {levels.map(l => (
          <div key={l.level} className={`border-2 ${l.border} rounded-lg p-4 ${l.bg}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-full ${l.badge} text-white flex items-center justify-center font-bold`}>
                {l.level}
              </div>
              <div>
                <div className={`font-bold ${l.title}`}>{l.name}</div>
                <div className={`text-xs ${l.subtitle}`}>{l.desc}</div>
              </div>
            </div>

            {/* Typical Characteristics */}
            <div className={`text-xs font-semibold ${l.title} mb-2`}>
              {isPtBR ? 'Caracteristicas Tipicas' : 'Typical Characteristics'}
            </div>
            <div className="space-y-1.5 text-sm mb-4">
              {l.characteristics.map((c, idx) => (
                <div key={idx} className="bg-white bg-opacity-50 rounded p-2">
                  <span className={`font-semibold ${l.title}`}>{c.label}:</span>{' '}
                  <span className={l.text}>{c.value}</span>
                </div>
              ))}
            </div>

            {/* Focus / Role */}
            <div className={`border-t ${l.divider} pt-3`}>
              <div className={`text-xs font-semibold ${l.title} mb-2`}>{l.focus.label}</div>
              <ul className="space-y-1">
                {l.focus.items.map((item, idx) => (
                  <li key={idx} className={`text-xs ${l.text} flex items-start gap-1.5`}>
                    <span className="shrink-0 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Support Model (Level 2 only) */}
            {l.support && (
              <div className={`mt-3 pt-3 border-t ${l.divider}`}>
                <div className={`text-xs font-semibold ${l.title} mb-1`}>
                  {isPtBR ? 'Modelo de Suporte' : 'Support Model'}
                </div>
                <div className={`text-xs ${l.text}`}>{l.support}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>{isPtBR ? 'Nota:' : 'Note:'}</strong> {isPtBR
            ? 'Os criterios de entrada do Nivel 3 devem ser sustentados por 3-4 sprints. Os limites de rollover podem variar conforme os processos internos de fechamento de tickets (nem todos os times seguem os mesmos passos).'
            : 'Level 3 entry criteria must be sustained for 3-4 sprints. Rollover thresholds may vary based on internal ticket closure processes (not all teams follow the same steps).'}
        </p>
      </div>
    </div>
  );
}
