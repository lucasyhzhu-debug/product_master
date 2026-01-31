import type { DriveStep } from 'driver.js';

/**
 * Dashboard onboarding tour steps configuration.
 * Each step targets a specific UI section via data-tour-step attributes.
 *
 * Popover positioning:
 * - All popovers positioned to appear as centered as possible on the page
 * - Using 'over' side places popover directly over element for maximum centering
 * - Elements on left side use 'right' to push popover toward center
 * - Elements on right side use 'left' to push popover toward center
 */
export const DASHBOARD_TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour-step="ingredients"]',
    popover: {
      title: 'Step 1: Add Ingredients',
      description:
        'Start by adding raw materials for your food recipes. Click "New Ingredient" to create your first ingredient with pricing information.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '[data-tour-step="materials"]',
    popover: {
      title: 'Step 2: Add Packaging Materials',
      description:
        'Add boxes, bags, labels, and other packaging components. These will be used in your packaging designs.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '[data-tour-step="recipes"]',
    popover: {
      title: 'Step 3: Create a Recipe',
      description:
        'Combine your ingredients into food formulas. Recipes automatically track ingredient costs and yield.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '[data-tour-step="packaging"]',
    popover: {
      title: 'Step 4: Create a Packaging Design',
      description:
        'Define packaging configurations using your materials. This calculates packaging costs per unit.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '[data-tour-step="products"]',
    popover: {
      title: 'Step 5: Create a Product',
      description:
        'Combine a recipe with packaging and set your retail price. COGS and margins are calculated automatically.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '[data-tour-step="orders"]',
    popover: {
      title: 'Step 6: Track Orders',
      description:
        'Create orders to track sales, monitor production queues, and manage fulfillment. Your dashboard shows real-time stats.',
      side: 'over',
      align: 'center',
    },
  },
];
