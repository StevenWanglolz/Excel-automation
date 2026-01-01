from __future__ import annotations

import re
from typing import Any, Dict, List

import pandas as pd

from app.transforms.base import BaseTransform
from app.transforms.registry import register_transform


def _coerce_int_list(values: Any) -> List[int]:
    if not isinstance(values, list):
        return []
    result: List[int] = []
    for value in values:
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            result.append(value)
            continue
        if isinstance(value, str):
            try:
                result.append(int(value))
            except ValueError:
                continue
    return result


def _normalize_text(value: str, case_sensitive: bool) -> str:
    return value if case_sensitive else value.lower()


def _matches_rule(candidate: str, rule: Dict[str, Any]) -> bool:
    operator = rule.get("operator", "contains")
    raw_value = rule.get("value")
    if not isinstance(raw_value, str) or raw_value.strip() == "":
        return False
    case_sensitive = bool(rule.get("caseSensitive", False))
    value = _normalize_text(raw_value.strip(), case_sensitive)
    target = _normalize_text(candidate, case_sensitive)

    if operator == "equals":
        return target == value
    if operator == "starts_with":
        return target.startswith(value)
    if operator == "ends_with":
        return target.endswith(value)
    if operator == "regex":
        try:
            return re.search(raw_value, candidate) is not None
        except re.error:
            return False
    return value in target


def _row_rule_mask(df: pd.DataFrame, rule: Dict[str, Any]) -> pd.Series:
    column = rule.get("column")
    if not isinstance(column, str) or column not in df.columns:
        return pd.Series([False] * len(df), index=df.index)

    operator = rule.get("operator", "equals")
    value = rule.get("value")
    series = df[column]

    if operator == "equals":
        return series == value
    if operator == "not_equals":
        return series != value
    if operator == "contains":
        return series.astype(str).str.contains(str(value), na=False)
    if operator == "not_contains":
        return ~series.astype(str).str.contains(str(value), na=False)
    if operator == "greater_than":
        return series > value
    if operator == "less_than":
        return series < value
    if operator == "is_blank":
        return series.isna() | (series == "")
    if operator == "is_not_blank":
        return series.notna() & (series != "")

    return pd.Series([False] * len(df), index=df.index)


@register_transform("remove_columns_rows")
@register_transform("remove_column")
class RemoveColumnsRowsTransform(BaseTransform):
    """Remove columns or rows based on selection rules."""

    def validate(self, df: pd.DataFrame, config: Dict[str, Any]) -> bool:
        """Validate the configuration. Be lenient - only fail if explicitly invalid."""
        mode = config.get("mode", "columns")
        if mode not in {"columns", "rows"}:
            print(f"[WARN] Invalid mode: {mode}, defaulting to 'columns'")
            return True  # Allow it to proceed with default

        if mode == "rows":
            row_config = config.get("rowSelection", {})
            if isinstance(row_config, dict):
                rules = row_config.get("rules", [])
                if isinstance(rules, list):
                    for rule in rules:
                        if not isinstance(rule, dict):
                            continue
                        column = rule.get("column")
                        if column and column not in df.columns:
                            print(
                                f"[WARN] Row filter column '{column}' not found in DataFrame")
                            return False

        if mode == "columns":
            column_config = config.get("columnSelection", {})
            if isinstance(column_config, dict):
                names = column_config.get("names", [])
                if isinstance(names, list):
                    for name in names:
                        if name not in df.columns:
                            print(
                                f"[WARN] Column '{name}' not found in DataFrame")
                            return False

        return True

    def execute(self, df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        mode = config.get("mode", "columns")

        if mode == "rows":
            row_config = config.get("rowSelection", {}) if isinstance(
                config.get("rowSelection"), dict) else {}
            indices = set(_coerce_int_list(row_config.get("indices", [])))

            range_config = row_config.get("range", {}) if isinstance(
                row_config.get("range"), dict) else {}
            start = range_config.get("start")
            end = range_config.get("end")
            if isinstance(start, bool):
                start = None
            if isinstance(end, bool):
                end = None
            if start is not None or end is not None:
                range_start = 0 if start is None else int(start)
                range_end = (len(df) - 1) if end is None else int(end)
                if range_end >= range_start:
                    indices.update(range(range_start, range_end + 1))

            valid_positions = [pos for pos in indices if 0 <= pos < len(df)]
            if valid_positions:
                df = df.drop(df.index[sorted(valid_positions)])

            rules = row_config.get("rules", []) if isinstance(
                row_config.get("rules"), list) else []
            if rules:
                masks = [_row_rule_mask(df, rule)
                         for rule in rules if isinstance(rule, dict)]
                if masks:
                    match_strategy = row_config.get("match", "any")
                    if match_strategy == "all":
                        combined = masks[0]
                        for mask in masks[1:]:
                            combined = combined & mask
                    else:
                        combined = masks[0]
                        for mask in masks[1:]:
                            combined = combined | mask
                    df = df.loc[~combined]

            return df

        column_config = config.get("columnSelection", {}) if isinstance(
            config.get("columnSelection"), dict) else {}
        names = column_config.get("names", []) if isinstance(
            column_config.get("names"), list) else []
        indices = _coerce_int_list(column_config.get("indices", []))
        match_rule = column_config.get("match", {}) if isinstance(
            column_config.get("match"), dict) else {}

        columns_to_drop = set()

        for name in names:
            if isinstance(name, str) and name in df.columns:
                columns_to_drop.add(name)

        for index in indices:
            if 0 <= index < len(df.columns):
                columns_to_drop.add(df.columns[index])

        if match_rule:
            for col in df.columns:
                if _matches_rule(col, match_rule):
                    columns_to_drop.add(col)

        if not columns_to_drop:
            return df

        return df.drop(columns=list(columns_to_drop), errors="ignore")
