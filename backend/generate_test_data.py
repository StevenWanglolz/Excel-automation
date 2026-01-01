
import pandas as pd

df = pd.DataFrame({
    'id': [1, 2, 3, 4, 5],
    'amount': [100, 200, 300, 400, 500],
    'category': ['A', 'B', 'A', 'C', 'B']
})

df.to_excel('test_data.xlsx', index=False)
print("Created test_data.xlsx")
