/**
 * ComponentTypesManager - CRUD for component types (production + packaging)
 */

import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout";
import { useConvexComponentTypes } from "@/hooks/convex";
import { ComponentTypeRow } from "@/components/inventory/ComponentTypeRow";
import { ComponentTypeDialog } from "@/components/inventory/ComponentTypeDialog";
import { EmptyState } from "@/components/shared";

export function ComponentTypesManager() {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<
    "production" | "direct_packaging" | "indirect_packaging"
  >("production");

  const components = useConvexComponentTypes(false);

  if (components === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const productionComponents = components.filter(
    (c) => c.category === "production"
  );
  const directPackagingComponents = components.filter(
    (c) => c.category === "direct_packaging"
  );
  const indirectPackagingComponents = components.filter(
    (c) => c.category === "indirect_packaging"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Component Types"
        action={
          <Button onClick={() => setEditDialogOpen(true)} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            New Component Type
          </Button>
        }
      />

      <Tabs
        value={selectedCategory}
        onValueChange={(value) =>
          setSelectedCategory(
            value as "production" | "direct_packaging" | "indirect_packaging"
          )
        }
      >
        <TabsList>
          <TabsTrigger value="production">
            Production ({productionComponents.length})
          </TabsTrigger>
          <TabsTrigger value="direct_packaging">
            Direct Packaging ({directPackagingComponents.length})
          </TabsTrigger>
          <TabsTrigger value="indirect_packaging">
            Indirect Packaging ({indirectPackagingComponents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="production">
          <Card>
            <CardHeader>
              <CardTitle>Production Components</CardTitle>
            </CardHeader>
            <CardContent>
              {productionComponents.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No production components"
                  description="Production components are balls made in the kitchen"
                />
              ) : (
                <div className="space-y-2">
                  {productionComponents.map((component) => (
                    <ComponentTypeRow
                      key={component._id}
                      component={component}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="direct_packaging">
          <Card>
            <CardHeader>
              <CardTitle>Direct Packaging Components</CardTitle>
            </CardHeader>
            <CardContent>
              {directPackagingComponents.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No direct packaging components"
                  description="Direct packaging is auto-included with products (boxes, stickers)"
                />
              ) : (
                <div className="space-y-2">
                  {directPackagingComponents.map((component) => (
                    <ComponentTypeRow
                      key={component._id}
                      component={component}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indirect_packaging">
          <Card>
            <CardHeader>
              <CardTitle>Indirect Packaging Components</CardTitle>
            </CardHeader>
            <CardContent>
              {indirectPackagingComponents.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No indirect packaging components"
                  description="Indirect packaging is optional add-ons (brochures, bags)"
                />
              ) : (
                <div className="space-y-2">
                  {indirectPackagingComponents.map((component) => (
                    <ComponentTypeRow
                      key={component._id}
                      component={component}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ComponentTypeDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        defaultCategory={selectedCategory}
      />
    </div>
  );
}
