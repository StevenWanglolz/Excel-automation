import io
import zipfile
from unittest.mock import MagicMock
from app.utils.export_utils import create_zip_archive

def test_zip_structure_flat():
    payload = [
        {"file_name": "file1.csv", "payload": b"content1"},
        {"file_name": "file2.csv", "payload": b"content2"}
    ]
    zip_bytes = create_zip_archive(payload, None)

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
    
    # Mock the batch object that the new utility expects
    mock_batch = MagicMock()
    mock_batch.name = batch_name
    
    zip_bytes = create_zip_archive(payload, mock_batch)

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        # Verify folder structure
        assert f"{batch_name}/file1.csv" in names
        assert f"{batch_name}/file2.csv" in names
        assert len(names) == 2

def test_zip_structure_sanitization():
    payload = [{"file_name": "file1.csv", "payload": b"content1"}]
    batch_name = "Dangerous/Batch:Name"
    
    mock_batch = MagicMock()
    mock_batch.name = batch_name

    zip_bytes = create_zip_archive(payload, mock_batch)

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        # Should replace / and : with _
        assert "Dangerous_Batch_Name/file1.csv" in names