import React from 'react';
import { Sticker as StickerIcon } from 'lucide-react';
import type { Sticker } from '../types';

interface StickerPickerProps {
  /** Active sticker designs to offer (already filtered + sorted by the caller). */
  stickers: Sticker[];
  /** Currently selected sticker id, or null when no sticker is chosen. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Optional sticker selector shown at checkout. Renders a "No sticker" choice
 * plus one card per active design. Selecting a card stores its id on the order;
 * choosing "No sticker" clears it. Renders nothing when no designs are offered.
 */
export function StickerPicker({ stickers, selectedId, onSelect }: StickerPickerProps) {
  if (stickers.length === 0) return null;

  const cardClass = (isSelected: boolean) =>
    `p-3 rounded border transition-all text-left flex items-center gap-3 ${
      isSelected
        ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
        : 'border-gray-200 hover:border-brand-300'
    }`;

  return (
    <div className="bg-white rounded shadow-clinical p-6 border border-gray-100">
      <h2 className="font-heading text-lg font-bold text-charcoal-900 mb-2 flex items-center gap-2">
        <div className="bg-brand-50 p-2 rounded text-brand-600">
          <StickerIcon className="w-5 h-5" />
        </div>
        Add a Sticker (Optional)
      </h2>
      <p className="text-xs text-gray-500 mb-4">Pick a free sticker design to include in your package.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedId === null}
          className={cardClass(selectedId === null)}
        >
          <span className="font-bold text-charcoal-900 text-sm">No sticker</span>
        </button>

        {stickers.map((sticker) => (
          <button
            key={sticker.id}
            type="button"
            onClick={() => onSelect(sticker.id)}
            aria-pressed={selectedId === sticker.id}
            className={cardClass(selectedId === sticker.id)}
          >
            {sticker.image_url && (
              <img
                src={sticker.image_url}
                alt=""
                className="w-10 h-10 rounded object-cover border border-gray-200 shrink-0"
              />
            )}
            <span className="font-bold text-charcoal-900 text-sm">{sticker.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default StickerPicker;
