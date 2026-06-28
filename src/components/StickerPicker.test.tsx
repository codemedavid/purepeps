import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StickerPicker } from './StickerPicker';
import type { Sticker } from '../types';

function sticker(overrides: Partial<Sticker> = {}): Sticker {
  return {
    id: 's1',
    name: 'Pink Logo',
    image_url: 'https://example.com/pink.png',
    is_active: true,
    sort_order: 1,
    created_at: '2026-06-01T08:00:00Z',
    ...overrides,
  };
}

describe('StickerPicker', () => {
  it('renders nothing when there are no stickers', () => {
    const { container } = render(
      <StickerPicker stickers={[]} selectedId={null} onSelect={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers a "no sticker" option plus each sticker', () => {
    render(
      <StickerPicker
        stickers={[sticker({ id: 's1', name: 'Pink Logo' }), sticker({ id: 's2', name: 'Cat' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /no sticker/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pink logo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cat/i })).toBeInTheDocument();
  });

  it('calls onSelect with the sticker id when a design is chosen', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <StickerPicker stickers={[sticker({ id: 's2', name: 'Cat' })]} selectedId={null} onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { name: /cat/i }));

    expect(onSelect).toHaveBeenCalledWith('s2');
  });

  it('calls onSelect with null when "no sticker" is chosen', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <StickerPicker stickers={[sticker({ id: 's1' })]} selectedId="s1" onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { name: /no sticker/i }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('marks the selected sticker as pressed', () => {
    render(
      <StickerPicker stickers={[sticker({ id: 's1', name: 'Pink Logo' })]} selectedId="s1" onSelect={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /pink logo/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /no sticker/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
