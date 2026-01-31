import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Confirm Action',
    description: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
  };

  it('renders title and description when open', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
    expect(screen.queryByText('Are you sure you want to proceed?')).not.toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenChange(false) when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders custom button labels', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
      />
    );

    expect(screen.getByRole('button', { name: 'Yes, Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, Keep' })).toBeInTheDocument();
  });

  it('uses default button labels when not specified', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('applies destructive variant styling to confirm button', () => {
    render(<ConfirmDialog {...defaultProps} variant="destructive" />);

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    // Destructive variant should have appropriate class
    expect(confirmButton.className).toMatch(/destructive/);
  });

  it('disables buttons while loading', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);

    const confirmButton = screen.getByRole('button', { name: 'Loading...' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  it('shows "Loading..." text on confirm button when loading', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} confirmLabel="Delete" />);

    // Even with custom confirmLabel, should show "Loading..." when loading
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('closes when escape key is pressed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />);

    // Press Escape key
    await user.keyboard('{Escape}');

    // Radix dialog calls onOpenChange(false) when escape is pressed
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
