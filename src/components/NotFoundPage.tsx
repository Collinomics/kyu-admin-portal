import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import KyButton from './ui/KyButton';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-kyu-blue/10 text-kyu-blue flex items-center justify-center">
          <Compass size={30} />
        </div>
        <h1 className="mt-4 text-3xl font-extrabold text-gray-800">404 — page not found</h1>
        <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
          The page you are looking for does not exist or was moved. Head back to your dashboard.
        </p>
        <Link to="/admin/dashboard" className="inline-block mt-6">
          <KyButton variant="accent">Back to Dashboard</KyButton>
        </Link>
      </div>
    </div>
  );
}