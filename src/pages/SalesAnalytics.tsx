import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/salesAnalytics/OverviewTab";
import { ProductMappingTab } from "@/components/salesAnalytics/ProductMappingTab";
import { SettingsTab } from "@/components/salesAnalytics/SettingsTab";
import { ConsignmentTab } from "@/components/salesAnalytics/ConsignmentTab";

export function SalesAnalytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "settings" ? "settings"
    : tabParam === "mappings" ? "mappings"
    : tabParam === "consignment" ? "consignment"
    : "overview";

  const handleTabChange = (value: string) => {
    setSearchParams(value === "overview" ? {} : { tab: value }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Analytics"
        description="Track revenue across all channels"
      />
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="mappings">Mappings</TabsTrigger>
          <TabsTrigger value="consignment">Consignment</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="mappings" className="mt-4">
          <ProductMappingTab />
        </TabsContent>
        <TabsContent value="consignment" className="mt-4">
          <ConsignmentTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
