import type { DriveStep } from 'driver.js';

/**
 * Dashboard onboarding tour steps configuration.
 * Each step targets a specific UI section via data-tour-step attributes.
 *
 * Popover positioning:
 * - Elements near bottom of viewport use 'top' to show popover above
 * - Elements near top of viewport use 'bottom' to show popover below
 * - All popovers are styled with a solid background panel for readability
 */
export const DASHBOARD_TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour-step="ingredients"]',
    popover: {
      title: 'Step 1: Add Ingredients',
      description:
        'Start by adding raw materials for your food recipes. Click "New Ingredient" to create your first ingredient with pricing information.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour-step="materials"]',
    popover: {
      title: 'Step 2: Add Packaging Materials',
      description:
        'Add boxes, bags, labels, and other packaging components. These will be used in your packaging designs.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour-step="recipes"]',
    popover: {
      title: 'Step 3: Create a Recipe',
      description:
        'Combine your ingredients into food formulas. Recipes automatically track ingredient costs and yield.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour-step="packaging"]',
    popover: {
      title: 'Step 4: Create a Packaging Design',
      description:
        'Define packaging configurations using your materials. This calculates packaging costs per unit.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour-step="products"]',
    popover: {
      title: 'Step 5: Create a Product',
      description:
        'Combine a recipe with packaging and set your retail price. COGS and margins are calculated automatically.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour-step="orders"]',
    popover: {
      title: 'Step 6: Track Orders',
      description:
        'Create orders to track sales, monitor production queues, and manage fulfillment. Your dashboard shows real-time stats.',
      side: 'bottom',
      align: 'center',
    },
  },
];
