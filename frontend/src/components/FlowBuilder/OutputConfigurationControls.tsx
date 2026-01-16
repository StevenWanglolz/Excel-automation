import React from 'react';
import type { File, BlockData } from '../../types';

interface OutputConfigurationControlsProps {
  nodeId: string;
  files: File[];
  updateNode: (id: string, data: { data: BlockData }) => void;
  nodeData: BlockData;
  hasUpstreamBatch: boolean;
  destinationMode: 'separate' | 'merge';
  updateDestinationMode: (mode: 'separate' | 'merge') => void;
  inputIdSuffix?: string;
}

export const OutputConfigurationControls: React.FC<OutputConfigurationControlsProps> = ({
  nodeId,
  files,
  updateNode,
  nodeData,
  hasUpstreamBatch,
  destinationMode,
  updateDestinationMode,
  inputIdSuffix = '',
}) => {
  const outputConfig = nodeData.output || {};

  return (
    <>
      <div className="space-y-3 pb-4 mb-4 border-b border-gray-100">
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">Write Mode</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={outputConfig.writeMode !== 'append'}
              onChange={() => {
                updateNode(nodeId, {
                  data: {
                    ...nodeData,
                    output: {
                      ...outputConfig,
                      writeMode: 'create',
                      baseFileId: null
                    }
                  }
                });
              }}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Create New File</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={outputConfig.writeMode === 'append'}
              onChange={() => {
                updateNode(nodeId, {
                  data: {
                    ...nodeData,
                    output: {
                      ...outputConfig,
                      writeMode: 'append'
                    }
                  }
                });
              }}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Append to Existing</span>
          </label>
        </div>

        {outputConfig.writeMode === 'append' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 mt-2">
            <label className="block text-xs font-medium text-amber-900 mb-1">
              Select Base File to Append To
            </label>
            <select
              value={outputConfig.baseFileId ?? ''}
              onChange={(e) => {
                const fileId = Number(e.target.value);
                updateNode(nodeId, {
                  data: {
                    ...nodeData,
                    output: {
                      ...outputConfig,
                      baseFileId: isNaN(fileId) ? null : fileId
                    }
                  }
                });
              }}
              className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-gray-700 focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="">Select a file...</option>
              {files.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.original_filename}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-amber-700 mt-2">
              New data will be added to this file. Existing sheets with same names will be overwritten.
            </p>
          </div>
        )}
      </div>

      {hasUpstreamBatch && (
        <div className="space-y-4 mb-4 pb-4 border-b border-gray-100">
          <div className="rounded-md border border-purple-200 bg-purple-50 p-3 mb-2">
            <div className="text-xs font-medium text-purple-900 mb-2">Output Mode</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`destinationMode-output-${nodeId}${inputIdSuffix}`}
                  value="separate"
                  checked={destinationMode === 'separate'}
                  onChange={() => updateDestinationMode('separate')}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="text-sm text-gray-900">N to N</span>
                  <p className="text-[10px] text-gray-500">One output file per source file (1:1)</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`destinationMode-output-${nodeId}${inputIdSuffix}`}
                  value="merge"
                  checked={destinationMode === 'merge'}
                  onChange={() => updateDestinationMode('merge')}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="text-sm text-gray-900">N to M</span>
                  <p className="text-[10px] text-gray-500">Merge or Split sources into custom outputs</p>
                </div>
              </label>
            </div>
          </div>

          {destinationMode === 'merge' && (
            <div className="text-xs text-gray-500 italic mb-2 px-1">
              Configure your output files below. You can add multiple files and link them to specific sources.
            </div>
          )}
        </div>
      )}
    </>
  );
};
