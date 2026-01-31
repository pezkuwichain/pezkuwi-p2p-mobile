import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { P2PDashboard } from './components/p2p/P2PDashboard';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="min-h-screen bg-background text-foreground">
          <P2PDashboard />
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
