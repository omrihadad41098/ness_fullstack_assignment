import { useHealth } from '../hooks/useHealth';

export default function HealthIndicator() {
  const { data, error, loading } = useHealth();

  if (loading) return <span className="text-sm text-slate-500">Checking API…</span>;
  if (error !== null || data === null) {
    return <span className="text-sm text-red-700">API unreachable</span>;
  }

  const dbUp = data.db === 'up';
  return (
    <span className="flex items-center gap-2 text-sm text-slate-600">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${dbUp ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      API ok · DB {data.db} · AI {data.aiProvider}
    </span>
  );
}
