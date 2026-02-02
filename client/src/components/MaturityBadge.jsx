export default function MaturityBadge({ level, name, description, size = 'default' }) {
  const colors = {
    1: 'bg-red-100 text-red-800 border-red-300',
    2: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    3: 'bg-green-100 text-green-800 border-green-300'
  };

  const sizeClasses = {
    small: 'text-sm px-3 py-1',
    default: 'text-base px-4 py-2',
    large: 'text-2xl px-6 py-4'
  };

  return (
    <div className={`maturity-badge border-2 ${colors[level]} ${sizeClasses[size]}`}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="font-bold">Level {level}</span>
          {size !== 'small' && (
            <>
              <span className="font-semibold">{name}</span>
              <span className="text-xs opacity-75">{description}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
