import { useState } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { TableTarget } from '../../types';

export const FlowSummary = () => {
  const { nodes } = useFlowStore();
  const [isExpanded, setIsExpanded] = useState(true);

  // Helper to resolve file names
  // We can't use hooks inside the map callback, so we might need a separate component or just best-effort
  // For now, let's just use what we have in the node data or fetch if needed (but fetching in render is bad)
  // We'll rely on the existing node data which usually contains labels.
  
  const futureSources = nodes.flatMap(n => 
    ((n.data.destinationTargets as TableTarget[]) || [])
      .filter((t: TableTarget) => t.isFutureSource)
      .map(t => ({ target: t, sourceNode: n }))
  );

  const finalOutputs = nodes.flatMap(n => 
    ((n.data.destinationTargets as TableTarget[]) || [])
      .filter((t: TableTarget) => t.isFinalOutput)
      .map(t => ({ target: t, sourceNode: n }))
  );

  // Simple resolution of label
  const getLabel = (t: TableTarget) => {
    if (t.virtualName) return t.virtualName;
    if (t.fileId) return `File #${t.fileId}`;
    if (t.virtualId?.startsWith('output:')) {
         const match = /output:.*:.*:(.*)/.exec(t.virtualId);
         return match ? match[1] : 'Output File';
    }
    return 'Unnamed Destination';
  };

  // if (futureSources.length === 0 && finalOutputs.length === 0) {
  //   return null;
  // }

  return (
    <div className={`flex flex-col h-full bg-white transition-all duration-300 ${isExpanded ? 'w-64' : 'w-12 items-center'}`}>
      <div 
        role="button"
        tabIndex={0}
        className="p-3 border-b border-gray-100 flex items-center justify-between cursor-pointer w-full focus:outline-none focus:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setIsExpanded(!isExpanded);
          }
        }}
      >
        {isExpanded ? (
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Flow Overview</h3>
        ) : (
          <div className="w-6 h-6 flex items-center justify-center text-indigo-600">
             {/* Small Icon when collapsed */}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        )}
        {isExpanded && (
             <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
             </svg>
        )}
      </div>

      {isExpanded && (
        <div className="p-3 space-y-4 flex-1 overflow-y-auto">
          {/* Future Sources */}
          {futureSources.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-indigo-700">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wide">Future Sources</span>
              </div>
              <div className="pl-2 space-y-1">
                {futureSources.map((item, i) => (
                  <div key={`${item.target.virtualId || item.target.fileId || i}`} className="text-xs border-l-2 border-indigo-100 pl-2 py-0.5">
                    <div className="font-medium text-gray-700 truncate" title={getLabel(item.target)}>{getLabel(item.target)}</div>
                    <div className="text-[10px] text-gray-400">from {item.sourceNode.data.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Outputs */}
          {finalOutputs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wide">Final Outputs</span>
              </div>
              <div className="pl-2 space-y-1">
                 {finalOutputs.map((item, i) => (
                  <div key={`${item.target.virtualId || item.target.fileId || i}`} className="text-xs border-l-2 border-emerald-100 pl-2 py-0.5">
                    <div className="font-medium text-gray-700 truncate" title={getLabel(item.target)}>{getLabel(item.target)}</div>
                    <div className="text-[10px] text-gray-400">from {item.sourceNode.data.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {futureSources.length === 0 && finalOutputs.length === 0 && (
            <div className="text-xs text-gray-400 italic text-center py-4">
              No sources or outputs configured yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
