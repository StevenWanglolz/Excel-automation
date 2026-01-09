from typing import Dict, Any, Tuple, List
import pandas as pd
from app.transforms.registry import get_transform
import app.transforms
from app.services.file_service import file_service


class TransformService:
    @staticmethod
    def execute_flow(
        file_paths_by_id: Dict[int, str],
        flow_data: Dict[str, Any]
    ) -> Tuple[Dict[str, pd.DataFrame], str | None, List[str]]:
        """Execute a flow and return the resulting tables and terminal keys."""
        nodes = flow_data.get("nodes", [])
        table_map: Dict[str, pd.DataFrame] = {}
        last_table_key: str | None = None
        default_file_id = next(iter(file_paths_by_id.keys()), None)
        
        used_source_keys = set()
        initial_source_keys = set()

        def table_key(file_id: int, sheet_name: str | None) -> str:
            return f"{file_id}:{sheet_name or '__default__'}"

        def virtual_key(virtual_id: str) -> str:
            return f"virtual:{virtual_id}"
        
        def get_key_for_target(target: Dict[str, Any]) -> str | None:
            virtual_id = target.get("virtualId")
            if isinstance(virtual_id, str):
                return virtual_key(virtual_id)
            file_id = target.get("fileId") or default_file_id
            if not file_id:
                return None
            sheet_name = target.get("sheetName")
            return table_key(file_id, sheet_name)

        # Pre-populate initial source keys
        for file_id, path in file_paths_by_id.items():
            # This is a simplification; a more robust approach would parse sheets.
            # For now, we assume the default sheet for each initial file.
            initial_source_keys.add(table_key(file_id, None))

        def load_table(file_id: int, sheet_name: str | None) -> pd.DataFrame:
            key = table_key(file_id, sheet_name)
            if key in table_map:
                return table_map[key]
            if file_id not in file_paths_by_id:
                return pd.DataFrame()
            df = file_service.parse_file(
                file_paths_by_id[file_id], sheet_name=sheet_name)
            table_map[key] = df
            return df

        def load_table_for_target(target: Dict[str, Any]) -> pd.DataFrame:
            key = get_key_for_target(target)
            if key:
                used_source_keys.add(key)

            virtual_id = target.get("virtualId")
            if isinstance(virtual_id, str):
                return table_map.get(key, pd.DataFrame())
            
            file_id = target.get("fileId") or default_file_id
            if not file_id:
                return pd.DataFrame()
            sheet_name = target.get("sheetName")
            return load_table(file_id, sheet_name)

        def store_table_for_target(target: Dict[str, Any], df: pd.DataFrame) -> str | None:
            key = get_key_for_target(target)
            if key:
                table_map[key] = df
            return key

        def build_transform_config(
            config: Dict[str, Any],
            node_data: Dict[str, Any]
        ) -> Dict[str, Any]:
            # ... (omitting original content for brevity, as it's unchanged) ...
            next_config = dict(config)
            lookup_target = node_data.get("lookupTarget")
            if isinstance(lookup_target, dict):
                lookup_file_id = lookup_target.get("fileId")
                lookup_sheet = lookup_target.get("sheetName")
                if lookup_file_id in file_paths_by_id:
                    next_config["lookup_df"] = load_table(
                        lookup_file_id, lookup_sheet)

            mapping_targets = node_data.get("mappingTargets") or []
            mapping_dfs: list[pd.DataFrame] = []
            if isinstance(mapping_targets, list):
                for mapping_target in mapping_targets:
                    if not isinstance(mapping_target, dict):
                        continue
                    mapping_file_id = mapping_target.get("fileId")
                    mapping_sheet = mapping_target.get("sheetName")
                    if mapping_file_id in file_paths_by_id:
                        mapping_dfs.append(load_table(mapping_file_id, mapping_sheet))
            if mapping_dfs:
                next_config["mapping_dfs"] = mapping_dfs
                if "lookup_df" not in next_config:
                    next_config["lookup_df"] = mapping_dfs[0]

            return next_config

        # Process nodes in order
        for node in nodes:
            data = node.get("data", {}) or {}
            block_type = data.get("blockType")

            if block_type in {"upload", "source", "data", "output", "mapping"}:
                continue

            source_targets = data.get("sourceTargets", []) or []
            destination_targets = data.get("destinationTargets", []) or []

            if not source_targets:
                legacy_source = data.get("target", {}) or {}
                if legacy_source:
                    source_targets = [legacy_source]

            if not destination_targets:
                legacy_destination = data.get("destination", {}) or {}
                if legacy_destination:
                    destination_targets = [legacy_destination]

            if not source_targets and destination_targets:
                source_targets = destination_targets
            if not source_targets and not destination_targets:
                continue
            if not destination_targets:
                destination_targets = source_targets
            config = data.get("config", {}) or {}

            transform_class = get_transform(block_type)
            if not transform_class:
                transform_class = get_transform(node.get("type"))

            if transform_class:
                transform = transform_class()
                transform_config = build_transform_config(config, data)
                
                # ... (omitting original transform execution logic for brevity) ...
                if len(source_targets) > len(destination_targets) and destination_targets:
                    result_frames = []
                    for source_target in source_targets:
                        df = load_table_for_target(source_target)
                        if transform.validate(df, transform_config):
                            result_frames.append(transform.execute(df, transform_config))

                    if result_frames:
                        combined_df = pd.concat(result_frames, ignore_index=True, sort=False)
                        for destination_target in destination_targets:
                            last_table_key = store_table_for_target(destination_target, combined_df.copy())
                    continue

                if len(source_targets) == 1 and len(destination_targets) > 1:
                    df = load_table_for_target(source_targets[0])
                    if transform.validate(df, transform_config):
                        result_df = transform.execute(df, transform_config)
                        for destination_target in destination_targets:
                            last_table_key = store_table_for_target(destination_target, result_df.copy())
                    continue

                if len(source_targets) != len(destination_targets):
                    continue

                for source_target, destination_target in zip(source_targets, destination_targets):
                    df = load_table_for_target(source_target)
                    if transform.validate(df, transform_config):
                        result_df = transform.execute(df, transform_config)
                        last_table_key = store_table_for_target(destination_target, result_df)

        all_generated_keys = set(table_map.keys())
        terminal_keys = list(all_generated_keys - used_source_keys - initial_source_keys)
        
        return table_map, last_table_key, terminal_keys


    @staticmethod
    def preview_step(
        file_path: str,
        step_config: Dict[str, Any],
        step_index: int = 0
    ) -> Dict[str, Any]:
        """Preview a single transformation step (single-file legacy path)."""
        df = file_service.parse_file(file_path)

        block_type = step_config.get("blockType")
        config = step_config.get("config", {})

        transform_class = get_transform(block_type)
        if transform_class:
            transform = transform_class()
            if transform.validate(df, config):
                preview_df = transform.preview(df, config)
                return file_service.get_file_preview(preview_df)

        return file_service.get_file_preview(df)


transform_service = TransformService()
