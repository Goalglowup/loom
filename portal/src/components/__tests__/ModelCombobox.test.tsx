import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ModelCombobox from '../ModelCombobox';

const MANY_OPTIONS = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet', 'llama-3'];

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

describe('strict mode', () => {
  const strictOptions = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];

  it('renders a button trigger instead of a text input', () => {
    render(<ModelCombobox value="" onChange={vi.fn()} options={strictOptions} strict />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('button label displays the current value', () => {
    render(<ModelCombobox value="gpt-4o" onChange={vi.fn()} options={strictOptions} strict />);
    expect(screen.getByRole('button')).toHaveTextContent('gpt-4o');
  });

  it('button label shows placeholder when value is empty', () => {
    render(<ModelCombobox value="" onChange={vi.fn()} options={strictOptions} placeholder="Select a model" strict />);
    expect(screen.getByRole('button')).toHaveTextContent('Select a model');
  });

  it('opens dropdown on click and shows all options', async () => {
    const user = userEvent.setup();
    render(<ModelCombobox value="" onChange={vi.fn()} options={strictOptions} strict />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('gpt-4-turbo')).toBeInTheDocument();
    expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
  });

  it('calls onChange with selected value and closes dropdown on option click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelCombobox value="" onChange={onChange} options={strictOptions} strict />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('gpt-4-turbo'));
    expect(onChange).toHaveBeenCalledWith('gpt-4-turbo');
    // Dropdown should be closed — options no longer visible
    expect(screen.queryByText('gpt-3.5-turbo')).not.toBeInTheDocument();
  });

  it('does not render a free-text input for the selected value', async () => {
    const user = userEvent.setup();
    render(<ModelCombobox value="" onChange={vi.fn()} options={strictOptions} placeholder="Pick model" strict />);
    // No textbox before opening
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // No textbox in the open state either (filter only appears for > 5 options)
    await user.click(screen.getByRole('button'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows a filter input when options exceed 5', async () => {
    const user = userEvent.setup();
    render(<ModelCombobox value="" onChange={vi.fn()} options={MANY_OPTIONS} strict />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();
  });

  it('filter input narrows the options list', async () => {
    const user = userEvent.setup();
    render(<ModelCombobox value="" onChange={vi.fn()} options={MANY_OPTIONS} strict />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByPlaceholderText('Filter…'), 'claude');
    expect(screen.getByText('claude-3-opus')).toBeInTheDocument();
    expect(screen.getByText('claude-3-sonnet')).toBeInTheDocument();
    expect(screen.queryByText('gpt-4-turbo')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-3.5-turbo')).not.toBeInTheDocument();
    expect(screen.queryByText('llama-3')).not.toBeInTheDocument();
  });

  it('disabled button does not open the dropdown', async () => {
    const user = userEvent.setup();
    render(<ModelCombobox value="" onChange={vi.fn()} options={strictOptions} strict disabled />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-4-turbo')).not.toBeInTheDocument();
  });
});
