export default function MaturityBadge({ level, name, description, size = 'default' }) {
  const config = {
    1: {
      bg: 'bg-red-600',
      ring: 'ring-red-200',
      text: 'text-white',
      subtext: 'text-red-100'
    },
    2: {
      bg: 'bg-yellow-500',
      ring: 'ring-yellow-200',
      text: 'text-white',
      subtext: 'text-yellow-100'
    },
    3: {
      bg: 'bg-green-600',
      ring: 'ring-green-200',
      text: 'text-white',
      subtext: 'text-green-100'
    }
  };

  const c = config[level] || config[1];

  if (size === 'small') {
    const smallColors = {
      1: 'bg-red-100 text-red-800 border-red-300',
      2: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      3: 'bg-green-100 text-green-800 border-green-300'
    };
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${smallColors[level]}`}>
        Level {level}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-5">
      <div className={`w-20 h-20 rounded-2xl ${c.bg} ring-4 ${c.ring} flex items-center justify-center shadow-lg`}>
        <span className={`text-3xl font-black ${c.text}`}>{level}</span>
      </div>
      <div>
        <div className="text-xl font-bold text-gray-900">{name}</div>
        <div className="text-sm text-gray-500">{description}</div>
      </div>
    </div>
  );
}
