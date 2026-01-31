import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CostTooltip } from '../CostTooltip';

describe('CostTooltip', () => {
  it('renders the info icon trigger', () => {
    render(
      <CostTooltip
        items={[{ label: 'Ingredient Cost', cost: 10000 }]}
      />
    );

    // The component renders an Info icon from lucide-react
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders breakdown items with formatted costs', async () => {
    const user = userEvent.setup();

    render(
      <CostTooltip
        items={[
          { label: 'Ingredient Cost', cost: 10000 },
          { label: 'Labor Cost', cost: 5000 },
        ]}
      />
    );

    // Hover over the trigger to show tooltip
    const trigger = document.querySelector('svg')!;
    await user.hover(trigger);

    // Wait for tooltip content to appear - Radix duplicates content for accessibility
    const ingredientLabels = await screen.findAllByText('Ingredient Cost:');
    expect(ingredientLabels.length).toBeGreaterThan(0);

    const laborLabels = screen.getAllByText('Labor Cost:');
    expect(laborLabels.length).toBeGreaterThan(0);
  });

  it('renders "-" for null cost values in items', async () => {
    const user = userEvent.setup();

    render(
      <CostTooltip
        items={[{ label: 'Unknown Cost', cost: null }]}
      />
    );

    const trigger = document.querySelector('svg')!;
    await user.hover(trigger);

    const labels = await screen.findAllByText('Unknown Cost:');
    expect(labels.length).toBeGreaterThan(0);

    // The dash should appear for null cost
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows total when provided', async () => {
    const user = userEvent.setup();

    render(
      <CostTooltip
        items={[
          { label: 'Part A', cost: 5000 },
          { label: 'Part B', cost: 3000 },
        ]}
        total={8000}
      />
    );

    const trigger = document.querySelector('svg')!;
    await user.hover(trigger);

    const totalLabels = await screen.findAllByText('Total:');
    expect(totalLabels.length).toBeGreaterThan(0);
  });

  it('does not show total section when total is undefined', async () => {
    const user = userEvent.setup();

    render(
      <CostTooltip
        items={[{ label: 'Cost', cost: 1000 }]}
      />
    );

    const trigger = document.querySelector('svg')!;
    await user.hover(trigger);

    const costLabels = await screen.findAllByText('Cost:');
    expect(costLabels.length).toBeGreaterThan(0);
    expect(screen.queryByText('Total:')).not.toBeInTheDocument();
  });

  it('handles null total value', async () => {
    const user = userEvent.setup();

    render(
      <CostTooltip
        items={[{ label: 'Item', cost: 2000 }]}
        total={null}
      />
    );

    const trigger = document.querySelector('svg')!;
    await user.hover(trigger);

    const totalLabels = await screen.findAllByText('Total:');
    expect(totalLabels.length).toBeGreaterThan(0);

    // The total should show "-" for null
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('handles empty items array', () => {
    render(<CostTooltip items={[]} />);

    // Should still render the trigger icon
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('formats large costs correctly', async () => {
    const user = userEvent.setup();

    render(
      <CostTooltip
        items={[{ label: 'Large Cost', cost: 1500000 }]}
        total={1500000}
      />
    );

    const trigger = document.querySelector('svg')!;
    await user.hover(trigger);

    const labels = await screen.findAllByText('Large Cost:');
    expect(labels.length).toBeGreaterThan(0);

    // Should show formatted currency (IDR format)
    const content = labels[0].closest('div')?.parentElement;
    expect(content?.textContent).toMatch(/1[.,]500[.,]000/);
  });
});
