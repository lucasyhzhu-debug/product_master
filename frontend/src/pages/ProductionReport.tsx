import { useState } from 'react';
import { useProductionReport } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer } from 'lucide-react';

const STATUS_OPTIONS = [
    'Confirmed',
    'Processing',
    'Ready for Pickup',
];

export function ProductionReport() {
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([
        'Confirmed',
        'Processing',
    ]);

    const { data: report, isLoading } = useProductionReport(selectedStatuses);

    const toggleStatus = (status: string) => {
        setSelectedStatuses((prev) =>
            prev.includes(status)
                ? prev.filter((s) => s !== status)
                : [...prev, status]
        );
    };

    const handlePrint = () => {
        window.print();
    };

    const totalItems = report?.reduce((sum, item) => sum + item.total_quantity, 0) || 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between no-print">
                <h1 className="text-3xl font-bold tracking-tight">Production Report</h1>
                <Button onClick={handlePrint} variant="outline">
                    <Printer className="mr-2 h-4 w-4" />
                    Print Report
                </Button>
            </div>

            <Card className="no-print">
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Filter by Status</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4">
                    {STATUS_OPTIONS.map((status) => (
                        <div key={status} className="flex items-center space-x-2">
                            <Checkbox
                                id={status}
                                checked={selectedStatuses.includes(status)}
                                onCheckedChange={() => toggleStatus(status)}
                            />
                            <Label htmlFor={status}>{status}</Label>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="print-content">
                <div className="mb-4 hidden print:block">
                    <h1 className="text-2xl font-bold">Daily Production Summary</h1>
                    <p className="text-sm text-muted-foreground">
                        Statuses: {selectedStatuses.join(', ')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Date: {new Date().toLocaleDateString()}
                    </p>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="border rounded-md">
                            <div className="grid grid-cols-12 gap-4 border-b bg-muted p-3 text-sm font-medium">
                                <div className="col-span-6">Product</div>
                                <div className="col-span-2 text-center">Variant</div>
                                <div className="col-span-2 text-right">Orders</div>
                                <div className="col-span-2 text-right">Total Qty</div>
                            </div>
                            <ScrollArea className="h-[calc(100vh-300px)] print:h-auto">
                                <div className="divide-y">
                                    {isLoading ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                            Loading report...
                                        </div>
                                    ) : report?.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                            No items found for selected statuses.
                                        </div>
                                    ) : (
                                        report?.map((item, index) => (
                                            <div
                                                key={`${item.product_name}-${item.product_variant}-${index}`}
                                                className="grid grid-cols-12 gap-4 p-3 text-sm hover:bg-muted/50"
                                            >
                                                <div className="col-span-6 font-medium">
                                                    {item.product_name}
                                                </div>
                                                <div className="col-span-2 text-center text-muted-foreground">
                                                    {item.product_variant || '-'}
                                                </div>
                                                <div className="col-span-2 text-right text-muted-foreground">
                                                    {item.order_count}
                                                </div>
                                                <div className="col-span-2 text-right font-bold">
                                                    {item.total_quantity}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                            {report && report.length > 0 && (
                                <div className="grid grid-cols-12 gap-4 border-t bg-muted/50 p-3 text-sm font-bold">
                                    <div className="col-span-10 text-right">Total Items:</div>
                                    <div className="col-span-2 text-right">{totalItems}</div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <style>{`
        @media print {
          .no-print {
            display: none;
          }
          .print-content {
            display: block;
          }
          body {
            padding: 20px;
          }
        }
      `}</style>
        </div>
    );
}
