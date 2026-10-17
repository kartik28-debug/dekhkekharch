# Student Data Directory

This directory holds the CSV used to provision student accounts.

## `students.csv` — format

```
roll_number,name
```

| Column | Rules |
|---|---|
| `roll_number` | Must be non-empty, unique within the file. Used as the login ID **and** the initial password. |
| `name` | Student's display name — max 200 chars. |

## How to import

1. Fill in `students.csv` with real data.
2. Ensure `backend/.env` is configured with `DATABASE_URL`.
3. From the **`backend/`** directory run:

```bash
python import_students.py
```

The script is idempotent:

- A roll number that already exists in the database **will not** be re-imported or have its password reset.
- Rows with missing `roll_number` or duplicate roll numbers within the CSV are reported and skipped.
- On success you will see a summary: how many were inserted, how many skipped.

## Security

- **Never commit a CSV with real student data.** The root `.gitignore` excludes `*.csv`.
- The safe empty template (`students.csv` with headers only) is the only CSV tracked by Git.
- This directory is not served by the frontend — it is only accessible on the server filesystem.
