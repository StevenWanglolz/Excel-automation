import { OutputConfig } from '../../types';

export const outputFileOptions = (outputConfig: OutputConfig) => {
    return (outputConfig.outputs || []).map((outputFile, index) => ({
        id: index + 1,
        outputId: outputFile.id,
        creatorNodeId: outputFile.creatorNodeId,
        label: outputFile.fileName || `output-${index + 1}.xlsx`,
        sheets: outputFile.sheets,
    }));
};

export const outputFileOptionById = (outputConfig: OutputConfig) => {
    const options = outputFileOptions(outputConfig);
    // mapped by string id for easy lookup
    return new Map(options.map((option) => [option.id, option]));
};
