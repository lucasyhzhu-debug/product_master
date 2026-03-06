/**
 * GrabFoodManager - Admin/Manager page for GrabFood POS integration.
 *
 * Features:
 * - Page-level outlet selector (filters all tabs)
 * - Orders tab: sync history, revenue table, custom date range
 * - Store Status tab: live status badge, pause/unpause, countdown timer
 * - Menu tab: item availability toggles, batch publish
 * - Settings tab: MerchantID management (add/edit outlets), OAuth credentials
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { Settings, Webhook } from "lucide-react";

// UI components
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Layout
import { PageHeader } from "@/components/layout/PageHeader";

// Hooks
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGrabFoodOrders,
  useGrabFoodOrderStats,
  useGrabFoodOutlets,
} from "@/hooks/convex/useGrabFood";
import type { Id } from "../../convex/_generated/dataModel";

// Extracted tab components
import { OrdersTab } from "@/components/salesAnalytics/OrdersTab";
import { StoreStatusTab } from "@/components/salesAnalytics/StoreStatusTab";
import { MenuTab } from "@/components/salesAnalytics/MenuTab";
import { GrabFoodSettingsTab } from "@/components/salesAnalytics/GrabFoodSettingsTab";
import { WebhooksTab } from "@/components/salesAnalytics/WebhooksTab";

// ============================================
// MAIN COMPONENT
// ============================================

export function GrabFoodManager() {
  useDocumentTitle("GrabFood Manager");

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam === "store"
      ? "store"
      : tabParam === "menu"
        ? "menu"
        : tabParam === "settings"
          ? "settings"
          : tabParam === "webhooks"
            ? "webhooks"
            : "orders";

  const handleTabChange = (value: string) => {
    setSearchParams(value === "orders" ? {} : { tab: value }, { replace: true });
  };

  // ---- Outlets ----
  const { outlets, isLoading: loadingOutlets } = useGrabFoodOutlets();
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");

  // Auto-select first outlet
  useEffect(() => {
    if (outlets && outlets.length > 0 && !selectedOutletId) {
      setSelectedOutletId(outlets[0]._id);
    }
  }, [outlets, selectedOutletId]);

  const selectedOutlet = outlets?.find((o) => o._id === selectedOutletId);
  const merchantID = selectedOutlet?.externalId ?? "";

  // ---- Orders data ----
  const outletIdTyped = selectedOutletId
    ? (selectedOutletId as Id<"externalOutlets">)
    : undefined;
  const { orders, isLoading: loadingOrders } = useGrabFoodOrders(outletIdTyped);
  const { stats } = useGrabFoodOrderStats(outletIdTyped);

  return (
    <div className="space-y-6">
      <PageHeader
        title="GrabFood Manager"
        description="Manage orders, store status, and menu for GrabFood outlets"
      />

      {/* Outlet selector */}
      <div className="flex items-center gap-4">
        <Label className="text-sm font-medium whitespace-nowrap">Outlet:</Label>
        {loadingOutlets ? (
          <Skeleton className="h-10 w-[240px]" />
        ) : outlets && outlets.length > 0 ? (
          <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select outlet" />
            </SelectTrigger>
            <SelectContent>
              {outlets.map((outlet) => (
                <SelectItem key={outlet._id} value={outlet._id}>
                  {outlet.name} ({outlet.externalId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">
            No outlets configured. Go to the Settings tab to add one.
          </p>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="store">Store Status</TabsTrigger>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            <Webhook className="h-4 w-4 mr-1" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <OrdersTab
            merchantID={merchantID}
            outletId={outletIdTyped}
            orders={orders}
            isLoading={loadingOrders}
            stats={stats}
            isAdmin={isAdmin}
          />
        </TabsContent>

        <TabsContent value="store" className="mt-4">
          <StoreStatusTab merchantID={merchantID} outletName={selectedOutlet?.name} />
        </TabsContent>

        <TabsContent value="menu" className="mt-4">
          <MenuTab merchantID={merchantID} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <GrabFoodSettingsTab outlets={outlets ?? []} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4">
          <WebhooksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
