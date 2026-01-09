import type { TableTarget } from '../../types';

interface OutputPreviewSelectorProps {
  targets: TableTarget[];
  onSelect: (target: TableTarget) => void;
  selectedTarget: TableTarget | null;
}

export const OutputPreviewSelector = ({ targets, onSelect, selectedTarget }: OutputPreviewSelectorProps) => {
  if (!targets || targets.length <= 1) {
    return null; 
  }

  return (
    <div className="p-2 bg-gray-50 border-b border-gray-200">
      <label htmlFor="output-selector" className="block text-sm font-medium text-gray-700 mb-1">
        Select Output to Preview
      </label>
      <select
        id="output-selector"
        value={selectedTarget?.virtualId || ''}
        onChange={(e) => {
          const selected = targets.find(t => t.virtualId === e.target.value);
          if (selected) {
            onSelect(selected);
          }
        }}
        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
      >
        <option value="" disabled>-- Select an output --</option>
        {targets.map(target => (
          <option key={target.virtualId} value={target.virtualId}>
            {target.virtualName || target.virtualId}
          </option>
        ))}
      </select>
    </div>
  );
};
