import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ModelCombobox from '../ModelCombobox';

const options = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];

describe('ModelCombobox', () => {
  it('renders with placeholder when value is empty', () => {
    render(<ModelCombobox value="" onChange={vi.fn()} options={options} placeholder="Select a model" />);
    expect(screen.getByPlaceholderText('Select a model')).toBeInTheDocument();
  });

  it('shows current value in input', () => {
    render(<ModelCombobox value="gpt-4o" onChange={vi.fn()} options={options} />);
    expect(screen.getByDisplayValue('gpt-4o')).toBeInTheDocument();
  });

  it('opens dropdown on focus', async () => {
    const user = userEvent.setup();
    render(<ModelCombobox value="" onChange={vi.fn()} options={options} />);
    await user.click(screen.getByRole('textbox'));
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-4-turbo')).toBeInTheDocument();
  });

  it('filters options based on typed value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelCombobox value="gpt-4" onChange={onChange} options={options} />);
    await user.click(screen.getByRole('textbox'));
    // gpt-4o and gpt-4-turbo match "gpt-4", gpt-3.5-turbo does not
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-4-turbo')).toBeInTheDocument();
    expect(screen.queryByText('gpt-3.5-turbo')).not.toBeInTheDocument();
  });

  it('calls onChange with selected model when option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelCombobox value="" onChange={onChange} options={options} />);
    await user.click(screen.getByRole('textbox'));
    await user.click(screen.getByText('gpt-4-turbo'));
    expect(onChange).toHaveBeenCalledWith('gpt-4-turbo');
  });

  it('is disabled when disabled prop is true', () => {
    render(<ModelCombobox value="" onChange={vi.fn()} options={options} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
