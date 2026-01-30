import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Layout } from '@/components/layout';
import { Dashboard, RecipeEditor, PackagingEditor, ProductEditor, IngredientsManager, MaterialsManager, OrderManager, OrderDetail, KitchenView } from '@/pages';

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="recipes/:id" element={<RecipeEditor />} />
            <Route path="packaging/:id" element={<PackagingEditor />} />
            <Route path="products/:id" element={<ProductEditor />} />
            <Route path="ingredients" element={<IngredientsManager />} />
            <Route path="materials" element={<MaterialsManager />} />
            <Route path="orders" element={<OrderManager />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="kitchen" element={<KitchenView />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
