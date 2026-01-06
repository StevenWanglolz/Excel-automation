import io
import zipfile
import re
from typing import List, Dict, Any, Optional

# Using a forward reference for FileBatch to avoid circular dependencies if this were to grow.
# However, direct import is also fine here.
from app.models.file_batch import FileBatch

def create_zip_archive(files_payload: List[Dict[str, Any]], output_batch: Optional[FileBatch] = None) -> bytes:
    """
    Creates a zip archive from a list of file payloads.

    :param files_payload: A list of dictionaries, where each dictionary
                          represents a file and contains 'file_name' and 'payload'.
    :param output_batch: If provided, files will be placed in a directory
                         named after the sanitized batch name.
    :return: The content of the zip file as bytes.
    """
    zip_output = io.BytesIO()
    with zipfile.ZipFile(zip_output, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_entry in files_payload:
            entry_name = file_entry["file_name"]
            if output_batch and hasattr(output_batch, 'name'):
                # Sanitize batch name for file path
                safe_batch_name = re.sub(
                    r'[^a-zA-Z0-9_\\- ]', '_', output_batch.name).strip()
                entry_name = f"{safe_batch_name}/{entry_name}"
            
            payload = file_entry["payload"]
            if isinstance(payload, str):
                payload = payload.encode('utf-8')

            zip_file.writestr(entry_name, payload)
    zip_output.seek(0)
    return zip_output.read()
