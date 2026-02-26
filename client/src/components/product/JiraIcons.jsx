// SVG icons matching Jira's issue type visual style
// Colors follow Jira's standard palette

const ICON_STYLES = {
  Initiative: { bg: '#FFAB00', icon: 'lightbulb' },
  Epic: { bg: '#904EE2', icon: 'lightning' },
  Story: { bg: '#63BA3C', icon: 'bookmark' },
  Task: { bg: '#4BADE8', icon: 'check' },
  Bug: { bg: '#E5493A', icon: 'circle' },
  'Sub-task': { bg: '#4BADE8', icon: 'subtask' },
  Improvement: { bg: '#63BA3C', icon: 'arrow-up' },
  Request: { bg: '#4BADE8', icon: 'inbox' }
};

export function IssueTypeIcon({ type, size = 14, className = '' }) {
  const style = ICON_STYLES[type] || { bg: '#6B778C', icon: 'check' };
  const s = size;
  const r = s * 0.18;
  const pad = s * 0.25;

  const renderIcon = () => {
    switch (style.icon) {
      case 'lightbulb':
        return (
          <>
            {/* Bulb */}
            <ellipse cx={s / 2} cy={s * 0.38} rx={s * 0.22} ry={s * 0.24} fill="white" />
            {/* Neck */}
            <rect x={s * 0.38} y={s * 0.55} width={s * 0.24} height={s * 0.14} rx={1} fill="white" />
            {/* Base */}
            <rect x={s * 0.4} y={s * 0.68} width={s * 0.2} height={s * 0.06} rx={1} fill="white" />
          </>
        );
      case 'lightning':
        return (
          <path
            d={`M${s * 0.55} ${pad} L${pad} ${s * 0.55} L${s * 0.45} ${s * 0.55} L${s * 0.4} ${s - pad} L${s - pad} ${s * 0.45} L${s * 0.55} ${s * 0.45} Z`}
            fill="white"
          />
        );
      case 'bookmark':
        return (
          <path
            d={`M${pad} ${pad + 1} L${pad} ${s - pad} L${s / 2} ${s * 0.65} L${s - pad} ${s - pad} L${s - pad} ${pad + 1} Z`}
            fill="white"
          />
        );
      case 'check':
        return (
          <path
            d={`M${pad + 1} ${s * 0.5} L${s * 0.42} ${s * 0.68} L${s - pad - 1} ${pad + 2}`}
            stroke="white" strokeWidth={s * 0.14} fill="none" strokeLinecap="round" strokeLinejoin="round"
          />
        );
      case 'circle':
        return (
          <circle cx={s / 2} cy={s / 2} r={s * 0.22} fill="white" />
        );
      case 'subtask':
        return (
          <>
            <rect x={pad + 1} y={pad + 1} width={s * 0.35} height={s * 0.35} rx={1} fill="white" opacity={0.6} />
            <rect x={s * 0.4} y={s * 0.4} width={s * 0.35} height={s * 0.35} rx={1} fill="white" />
          </>
        );
      case 'arrow-up':
        return (
          <path
            d={`M${s / 2} ${pad + 1} L${s - pad - 1} ${s * 0.6} L${s * 0.6} ${s * 0.6} L${s * 0.6} ${s - pad - 1} L${s * 0.4} ${s - pad - 1} L${s * 0.4} ${s * 0.6} L${pad + 1} ${s * 0.6} Z`}
            fill="white"
          />
        );
      default:
        return (
          <rect x={pad} y={pad} width={s - pad * 2} height={s - pad * 2} rx={1} fill="white" opacity={0.5} />
        );
    }
  };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className={`inline-block flex-shrink-0 ${className}`}>
      <rect width={s} height={s} rx={r} fill={style.bg} />
      {renderIcon()}
    </svg>
  );
}

// Reusable Jira link component
export function JiraLink({ issueKey, jiraBaseUrl, children, className = '', onClick }) {
  if (!jiraBaseUrl) {
    return <span className={className}>{children || issueKey}</span>;
  }
  return (
    <a
      href={`${jiraBaseUrl}/browse/${issueKey}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`hover:underline ${className}`}
      onClick={onClick || (e => e.stopPropagation())}
    >
      {children || issueKey}
    </a>
  );
}
