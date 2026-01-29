import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Layout } from '@/components/layout';
import { Dashboard, RecipeEditor, PackagingEditor, ProductEditor, IngredientsManager, MaterialsManager, OrderManager, OrderDetail } from '@/pages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="recipes/:id" element={<RecipeEditor />} />
              <Route path="packaging/:id" element={<PackagingEditor />} />
              <Route path="products/:id" element={<ProductEditor />} />
              <Route path="ingredients/:id" element={<IngredientsManager />} />
              <Route path="materials/:id" element={<MaterialsManager />} />
              <Route path="orders" element={<OrderManager />} />
              <Route path="orders/:id" element={<OrderDetail />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
