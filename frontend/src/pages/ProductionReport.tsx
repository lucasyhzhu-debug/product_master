import { useState } from 'react';
import { useProductionReport } from '@/hooks/useOrders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};

export default function ProductionReport() {
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    const { data: report, isLoading } = useProductionReport(
        startDate || null,
        endDate || null
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Production Report</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filter (Optional)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 items-end">
                        <div className="grid gap-2">
                            <label htmlFor="start_date" className="text-sm font-medium">Start Date</label>
                            <Input
                                type="date"
                                id="start_date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label htmlFor="end_date" className="text-sm font-medium">End Date</label>
                            <Input
                                type="date"
                                id="end_date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : report ? (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Original</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{report.summary.original} units</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Bite Sized</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{report.summary.bite_sized} units</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Detailed List */}
                    <div className="space-y-4">
                        {report.dates.length === 0 ? (
                            <div className="text-center p-8 text-muted-foreground">
                                No orders found for this period.
                            </div>
                        ) : (
                            report.dates.map((dateGroup) => (
                                <Card key={dateGroup.date}>
                                    <CardHeader className="bg-muted/50">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-lg">
                                                {formatDate(dateGroup.date)}
                                            </CardTitle>
                                            <div className="text-sm space-x-4">
                                                <span className="font-medium text-amber-700">
                                                    Orig: {dateGroup.summary.original}
                                                </span>
                                                <span className="font-medium text-blue-700">
                                                    Bite: {dateGroup.summary.bite_sized}
                                                </span>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-4">
                                        <div className="space-y-4">
                                            {dateGroup.orders.map((order) => (
                                                <div key={order.order_number} className="border-b last:border-0 pb-4 last:pb-0">
                                                    <div className="flex justify-between mb-2">
                                                        <div className="font-semibold">
                                                            {order.customer_name}
                                                            <span className="text-muted-foreground font-normal ml-2">
                                                                ({order.order_number})
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {order.status}
                                                        </div>
                                                    </div>
                                                    <div className="pl-4 space-y-1">
                                                        {order.items.map((item, idx) => (
                                                            <div key={idx} className="text-sm grid grid-cols-12 gap-2">
                                                                <div className="col-span-6">{item.product_name}</div>
                                                                <div className="col-span-2 text-right">{item.quantity} x</div>
                                                                <div className="col-span-4 text-right">
                                                                    {item.units} units ({item.production_type === 'original' ? 'Orig' : 'Bite'})
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
