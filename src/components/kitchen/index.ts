export { KanbanColumn } from './KanbanColumn';
export { PackageCounter } from './PackageCounter';
export { BoxingOrderCard } from './BoxingOrderCard';
export { StickeringOrderCard } from './StickeringOrderCard';
export { ReadyToShipCard } from './ReadyToShipCard';
export { BallTrayCounter } from './BallTrayCounter';
export { PackagingStockItem } from './PackagingStockItem';
export { DailySummaryWidget } from './DailySummaryWidget';
export { BatchConfirmDialog } from './BatchConfirmDialog';

// Kitchen V3 Redesign
export { SwipeableKitchenLayout } from './SwipeableKitchenLayout';
export { ProductionLogPanel } from './ProductionLogPanel';
export { BoxingPanel } from './BoxingPanel';
export { StickeringPanel } from './StickeringPanel';
export { PackingPanel } from './PackingPanel';
export { FlipNumber, FlowChevrons } from './FlipNumber';
export { GoFoodStickerCard } from './GoFoodStickerCard';
export { GoFoodPackingCard } from './GoFoodPackingCard';
export { K3MartStockCard } from './K3MartStockCard';
export { K3MartPackingCard } from './K3MartPackingCard';

// Kitchen V3 Dashboard Header
export { DashboardHeader } from './DashboardHeader';
export { StatCard } from './StatCard';
export { TargetConfigPopover } from './TargetConfigPopover';

// Kitchen V3 Due-date order list
export { DueDateGroupHeader } from './DueDateGroupHeader';
export { KitchenOrderCard } from './KitchenOrderCard';
export { KitchenOrderChecklist } from './KitchenOrderChecklist';
export { K3MartSyntheticCard } from './K3MartSyntheticCard';
export { DueDateOrderList } from './DueDateOrderList';

// Shared kitchen constants
export type WasteReason = "qa_testing" | "spoilage" | "waste";

export const WASTE_REASONS: { value: WasteReason; label: string }[] = [
  { value: "qa_testing", label: "QA / Testing" },
  { value: "spoilage", label: "Spoilage" },
  { value: "waste", label: "Waste" },
];

// Kitchen V4 Redesign — Phase 21
export { ProductionTargetsBar } from './ProductionTargetsBar';
export type { KitchenTargets } from './ProductionTargetsBar';
export { EndOfShiftForm } from './EndOfShiftForm';
export { ShiftReviewModal } from './ShiftReviewModal';
export { ShiftSuccessScreen } from './ShiftSuccessScreen';
