
import pytest
from app.api.routes.transform import export_result
from app.types import OutputConfig, OutputFileConfig
from fastapi.responses import Response
import io
import zipfile

# Mocking necessary structures since we don't have the full DB context here
# We'll test the logic of zip creation in isolation if possible, or mock the dependencies.
# Given `export_result` is an endpoint that uses `precomputed_values` and `nodes` from DB,
# we might need to mock the services.

# However, the user wants "do same groups get exported in the same group file".
# This logic is inside `transform.py`.
# Let's inspect `transform.py` again to see how we can unittest the specific logic
# without spinning up the whole DB.

# Actually, the logic is creating a ZipFile.
# We can create a small reproduction script that mimics the logic toverify the behavior
# if we can't easily import the endpoint due to deps.
# But let's try to verify via a standalone script that imports the app if possible,
# or just creates a similar zip structure to prove the concept?
# No, we should test the actual code.

# Let's write a test that mocks `get_node_data`, `get_precomputed_values` etc.
# But for now, I'll create a script that just verifying the logic I added by
# inspecting the file I modified: `backend/app/api/routes/transform.py`.

# Better yet, I will write a test file `backend/tests/test_export_logic.py`
# that mocks the data and calls the function if feasible.
# If `export_result` is too coupled, I will extract the zip creation logic into a helper
# or mock heavily.

# Let's try to mock the dependencies.
