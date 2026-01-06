
import io
import zipfile
import re
from unittest.mock import MagicMock

# Logic copied from `transform.py` for isolation testing since we can't easily mock the full FastAPI app context here


def create_zip_payload(files_payload, output_batch_name=None):
    zip_output = io.BytesIO()
    with zipfile.ZipFile(zip_output, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_entry in files_payload:
            entry_name = file_entry["file_name"]
            if output_batch_name:
                # Sanitize batch name for file path
                safe_batch_name = re.sub(
                    r'[^a-zA-Z0-9_\- ]', '_', output_batch_name).strip()
                entry_name = f"{safe_batch_name}/{entry_name}"
            zip_file.writestr(entry_name, file_entry["payload"])
    zip_output.seek(0)
    return zip_output.read()


def test_zip_structure_flat():
    payload = [
        {"file_name": "file1.csv", "payload": b"content1"},
        {"file_name": "file2.csv", "payload": b"content2"}
    ]
    zip_bytes = create_zip_payload(payload, None)

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        assert "file1.csv" in names
        assert "file2.csv" in names
        assert len(names) == 2


def test_zip_structure_with_batch_folder():
    payload = [
        {"file_name": "file1.csv", "payload": b"content1"},
        {"file_name": "file2.csv", "payload": b"content2"}
    ]
    batch_name = "My Test Batch"
    zip_bytes = create_zip_payload(payload, batch_name)

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        # Verify folder structure
        assert "My Test Batch/file1.csv" in names
        assert "My Test Batch/file2.csv" in names
        assert len(names) == 2


def test_zip_structure_sanitization():
    payload = [{"file_name": "file1.csv", "payload": b"content1"}]
    batch_name = "Dangerous/Batch:Name"
    zip_bytes = create_zip_payload(payload, batch_name)

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        # Should replace / and : with _
        assert "Dangerous_Batch_Name/file1.csv" in names
