# Temporary security exceptions

Place one `SEC-EX-YYYY-NNN.json` per temporary HIGH/CRITICAL exception. Use the central schema and validator. Active exceptions expire after at most 30 days; an ignored Trivy CVE must have a matching active document here.

Coverage uses one reserved file, `coverage.json`, following `schemas/coverage-exception.schema.json`. It may set only a bounded changed-lines and/or total-lines floor. It never lowers `.standards/coverage-ratchet.json`, and the shared gate rejects it after at most 30 days.
