export default function MaturityLevelsReference({ locale = 'en', t }) {
  const isPtBR = locale === 'pt-BR';

  const levels = [
    {
      level: 1,
      name: t ? t('level1Name') : 'Assisted Scrum',
      desc: t ? t('level1Desc') : 'Scrum Manager Required',
      border: 'border-red-300', bg: 'bg-red-50', badge: 'bg-red-600',
      title: 'text-red-900', subtitle: 'text-red-700', text: 'text-red-800', divider: 'border-red-300',
      metrics: [
        { label: isPtBR ? 'Taxa de Rollover:' : 'Rollover Rate:', value: '> 20-25%' },
        { label: isPtBR ? 'Metas da Sprint:' : 'Sprint Goals Met:', value: '< 50-60%' },
        { label: isPtBR ? 'Saude do Backlog:' : 'Backlog Health:', value: isPtBR ? 'Higiene ruim' : 'Poor hygiene' },
        { label: isPtBR ? 'Injecao Mid-Sprint:' : 'Mid-Sprint Injection:', value: isPtBR ? 'Alta (>25%)' : 'High (>25%)' }
      ],
      footer: { label: isPtBR ? 'Foco:' : 'Focus:', text: isPtBR ? 'Estabelecer cadencia operacional basica, melhorar planejamento' : 'Establish basic operating cadence, improve planning' }
    },
    {
      level: 2,
      name: t ? t('level2Name') : 'Supported Scrum',
      desc: t ? t('level2Desc') : 'Conditional Support',
      border: 'border-yellow-300', bg: 'bg-yellow-50', badge: 'bg-yellow-600',
      title: 'text-yellow-900', subtitle: 'text-yellow-700', text: 'text-yellow-800', divider: 'border-yellow-300',
      metrics: [
        { label: isPtBR ? 'Taxa de Rollover:' : 'Rollover Rate:', value: '~10-20%' },
        { label: isPtBR ? 'Metas da Sprint:' : 'Sprint Goals Met:', value: '~60-70%' },
        { label: isPtBR ? 'Saude do Backlog:' : 'Backlog Health:', value: isPtBR ? 'Geralmente saudavel' : 'Mostly healthy' },
        { label: isPtBR ? 'Mudanca de Escopo:' : 'Scope Churn:', value: isPtBR ? 'Gerenciavel' : 'Manageable' }
      ],
      footer: { label: isPtBR ? 'Modelo de Suporte:' : 'Support Model:', text: isPtBR ? 'Scrum Manager compartilhado, 1-2 sprints/mes' : 'Shared Scrum Manager, 1-2 sprints/month' }
    },
    {
      level: 3,
      name: t ? t('level3Name') : 'Self-Managed Scrum',
      desc: t ? t('level3Desc') : 'Scrum Manager Optional',
      border: 'border-green-300', bg: 'bg-green-50', badge: 'bg-green-600',
      title: 'text-green-900', subtitle: 'text-green-700', text: 'text-green-800', divider: 'border-green-300',
      metrics: [
        { label: isPtBR ? 'Taxa de Rollover:' : 'Rollover Rate:', value: '< 10-15%' },
        { label: isPtBR ? 'Metas da Sprint:' : 'Sprint Goals Met:', value: '> 70%' },
        { label: isPtBR ? 'Backlog Pronto:' : 'Backlog Ready:', value: '> 80-90%' },
        { label: isPtBR ? 'Mudanca Mid-Sprint:' : 'Mid-Sprint Churn:', value: isPtBR ? 'Minima (<10%)' : 'Minimal (<10%)' }
      ],
      footer: { label: isPtBR ? 'Suporte:' : 'Support:', text: isPtBR ? 'Coaching sob demanda, verificacoes trimestrais' : 'On-demand coaching, quarterly health checks' }
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

            <div className="space-y-2 text-sm">
              {l.metrics.map((m, idx) => (
                <div key={idx} className="bg-white bg-opacity-50 rounded p-2">
                  <div className={`font-semibold ${l.title}`}>{m.label}</div>
                  <div className={l.text}>{m.value}</div>
                </div>
              ))}
            </div>

            <div className={`mt-4 pt-3 border-t ${l.divider}`}>
              <div className={`text-xs font-semibold ${l.title} mb-1`}>{l.footer.label}</div>
              <div className={`text-xs ${l.text}`}>{l.footer.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>{isPtBR ? 'Nota:' : 'Note:'}</strong> {isPtBR
            ? 'Os criterios de entrada do Nivel 3 devem ser sustentados por 3-4 sprints. Os limites de rollover podem variar com base nos processos internos de fechamento de tickets.'
            : 'Level 3 entry criteria must be sustained for 3-4 sprints. Rollover thresholds may vary based on internal ticket closure processes.'}
        </p>
      </div>
    </div>
  );
}
