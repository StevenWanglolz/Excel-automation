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

        def load_table(file_id: int, sheet_name: str | None) -> pd.DataFrame:
            key = table_key(file_id, sheet_name)
            if key in table_map:
                return table_map[key]
            df = file_service.parse_file(
                file_paths_by_id[file_id], sheet_name=sheet_name)
            table_map[key] = df
            return df

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
            return next_config

        # Process nodes in order - transformations are applied sequentially.
        for node in nodes:
            data = node.get("data", {}) or {}
            block_type = data.get("blockType")

            # Skip non-transform nodes - they are data sources or output metadata.
            if block_type in {"upload", "source", "data", "output"}:
                continue

            target = data.get("target", {}) or {}
            target_file_id = target.get("fileId") or default_file_id
            target_sheet = target.get("sheetName")
            if not target_file_id:
                continue

            df = load_table(target_file_id, target_sheet)
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
                is_valid = transform.validate(df, transform_config)
                print(f"[DEBUG] Validation result: {is_valid}")
                if is_valid:
                    print(f"[DEBUG] Executing transform {block_type}")
                    df = transform.execute(df, transform_config)
                    print(
                        f"[DEBUG] Transform executed. Result shape: {df.shape}, columns: {list(df.columns)}")
                    table_map[table_key(target_file_id, target_sheet)] = df
                    last_table_key = table_key(target_file_id, target_sheet)
                    print(
                        f"[DEBUG] Updated last_table_key to: {last_table_key}")
                else:
                    print(
                        f"[DEBUG] Transform {block_type} validation failed, skipping execution")

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
