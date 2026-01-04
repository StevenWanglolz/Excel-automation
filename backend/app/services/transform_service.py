from typing import Dict, Any, Tuple
import pandas as pd
from app.transforms.registry import get_transform
import app.transforms
from app.services.file_service import file_service


class TransformService:
    @staticmethod
    def execute_flow(
        file_paths_by_id: Dict[int, str],
        flow_data: Dict[str, Any]
    ) -> Tuple[Dict[str, pd.DataFrame], str | None]:
        """Execute a flow across one or more file/sheet targets."""
        # Flow data structure: nodes array where each node represents a transformation block
        nodes = flow_data.get("nodes", [])
        table_map: Dict[str, pd.DataFrame] = {}
        last_table_key: str | None = None
        default_file_id = next(iter(file_paths_by_id.keys()), None)

        def table_key(file_id: int, sheet_name: str | None) -> str:
            return f"{file_id}:{sheet_name or '__default__'}"

        def virtual_key(virtual_id: str) -> str:
            return f"virtual:{virtual_id}"

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
            virtual_id = target.get("virtualId")
            if isinstance(virtual_id, str):
                key = virtual_key(virtual_id)
                return table_map.get(key, pd.DataFrame())
            file_id = target.get("fileId") or default_file_id
            if not file_id:
                return pd.DataFrame()
            sheet_name = target.get("sheetName")
            return load_table(file_id, sheet_name)

        def store_table_for_target(target: Dict[str, Any], df: pd.DataFrame) -> str | None:
            virtual_id = target.get("virtualId")
            if isinstance(virtual_id, str):
                key = virtual_key(virtual_id)
                table_map[key] = df
                return key
            file_id = target.get("fileId")
            if not file_id:
                return None
            sheet_name = target.get("sheetName")
            key = table_key(file_id, sheet_name)
            table_map[key] = df
            return key

        def build_transform_config(
            config: Dict[str, Any],
            node_data: Dict[str, Any]
        ) -> Dict[str, Any]:
            # Clone config to avoid mutating stored flow data.
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

        # Process nodes in order - transformations are applied sequentially.
        for node in nodes:
            data = node.get("data", {}) or {}
            block_type = data.get("blockType")

            # Skip non-transform nodes - they are data sources or output metadata.
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

            # Look up transform class from registry using block type.
            transform_class = get_transform(block_type)
            if not transform_class:
                node_type = node.get("type")
                transform_class = get_transform(node_type)

            if transform_class:
                transform = transform_class()
                transform_config = build_transform_config(config, data)
                # Validate config before executing - prevents errors from invalid configurations.
                print(
                    f"[DEBUG] Validating transform {block_type} with config: {transform_config}")

                if len(source_targets) > len(destination_targets) and destination_targets:
                    # Append mode: combine all source results into each destination.
                    result_frames = []
                    for source_target in source_targets:
                        df = load_table_for_target(source_target)
                        is_valid = transform.validate(df, transform_config)
                        print(f"[DEBUG] Validation result: {is_valid}")
                        if not is_valid:
                            print(
                                f"[DEBUG] Transform {block_type} validation failed, skipping execution"
                            )
                            continue
                        print(f"[DEBUG] Executing transform {block_type}")
                        result_df = transform.execute(df, transform_config)
                        print(
                            f"[DEBUG] Transform executed. Result shape: {result_df.shape}, columns: {list(result_df.columns)}")
                        result_frames.append(result_df)

                    if result_frames:
                        combined_df = pd.concat(result_frames, ignore_index=True, sort=False)
                        for destination_target in destination_targets:
                            last_table_key = store_table_for_target(destination_target, combined_df.copy())
                        print(
                            f"[DEBUG] Updated last_table_key to: {last_table_key}")
                    continue

                # Fan-out: one source writes to multiple destinations.
                if len(source_targets) == 1 and len(destination_targets) > 1:
                    source_target = source_targets[0]
                    df = load_table_for_target(source_target)
                    is_valid = transform.validate(df, transform_config)
                    print(f"[DEBUG] Validation result: {is_valid}")
                    if not is_valid:
                        print(
                            f"[DEBUG] Transform {block_type} validation failed, skipping execution"
                        )
                        continue
                    print(f"[DEBUG] Executing transform {block_type}")
                    result_df = transform.execute(df, transform_config)
                    print(
                        f"[DEBUG] Transform executed. Result shape: {result_df.shape}, columns: {list(result_df.columns)}")
                    for destination_target in destination_targets:
                        last_table_key = store_table_for_target(destination_target, result_df.copy())
                    print(
                        f"[DEBUG] Updated last_table_key to: {last_table_key}")
                    continue

                if len(source_targets) != len(destination_targets):
                    print(
                        f"[DEBUG] Source/destination mismatch (sources={len(source_targets)}, destinations={len(destination_targets)}), skipping execution"
                    )
                    continue

                pairs = zip(source_targets, destination_targets)
                for source_target, destination_target in pairs:
                    df = load_table_for_target(source_target)
                    is_valid = transform.validate(df, transform_config)
                    print(f"[DEBUG] Validation result: {is_valid}")
                    if not is_valid:
                        print(
                            f"[DEBUG] Transform {block_type} validation failed, skipping execution"
                        )
                        continue
                    print(f"[DEBUG] Executing transform {block_type}")
                    result_df = transform.execute(df, transform_config)
                    print(
                        f"[DEBUG] Transform executed. Result shape: {result_df.shape}, columns: {list(result_df.columns)}")
                    last_table_key = store_table_for_target(destination_target, result_df)
                    print(
                        f"[DEBUG] Updated last_table_key to: {last_table_key}")

        print(f"[DEBUG] Final last_table_key: {last_table_key}")
        return table_map, last_table_key

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
