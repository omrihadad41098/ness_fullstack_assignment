import { Link, Route, Routes } from 'react-router-dom';
import LibraryPage from './pages/LibraryPage';
import AssetPage from './pages/AssetPage';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Knowledge Management System
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/assets/:id" element={<AssetPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-2 inline-block text-sm text-blue-700 underline">
        Back to the library
      </Link>
    </div>
  );
}
