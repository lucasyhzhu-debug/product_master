import { PageHeader } from "@/components/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/salesAnalytics/OverviewTab";
import { SettingsTab } from "@/components/salesAnalytics/SettingsTab";

export function SalesAnalytics() {
  return (
    <div className="p-6">
      <PageHeader
        title="Sales Analytics"
        description="Track revenue from K3 Mart and GoBiz, manage API connections"
      />
      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
