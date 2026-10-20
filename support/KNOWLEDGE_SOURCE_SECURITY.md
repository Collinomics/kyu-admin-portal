# Governed AI knowledge sources

## Authority and lifecycle

Only a System Administrator can upload, review or release a knowledge source. A file follows this fail-closed lifecycle:

1. Security inspection before storage.
2. Private quarantine storage outside the public web root.
3. Antivirus scan, safe extraction and deterministic validation.
4. Administrator review of extracted, read-only chunks and all findings.
5. Password-confirmed release request with a recorded reason.
6. Restricted AI indexing.
7. Activation only after indexing succeeds.

Uploading does not publish, index or activate a document. The previously active version remains active until the replacement finishes indexing.

The Monitor displays upload inspection, malware scanning, safe extraction, rule validation, administrator review and AI indexing as separate progress stages. Unreleased sources may be permanently removed only by a System Administrator after password confirmation and a recorded reason. Released sources are first placed in removal-pending state and removed only after the outbox worker has deleted their AI index chunks. The audit event is retained.

## Accepted formats

- PDF (`.pdf`)
- Excel Open XML (`.xlsx`)
- comma-separated values (`.csv`)
- Word Open XML (`.docx`)
- Markdown (`.md`)

Legacy `.xls` and `.doc` files are not accepted. `.md5` is a checksum filename, not a knowledge-document format.

Files are rejected before storage for extension/MIME mismatch, misleading executable filenames, unsafe archive paths, archive expansion limits, macros, executable or embedded Office objects, active PDF content, encryption, malformed structure, binary text or invalid UTF-8. CSV and Excel formulas are never executed.

Prompt-like instructions inside any extracted format are treated as untrusted document content and generate a blocking review finding.

## Antivirus requirement

Set `KNOWLEDGE_ANTIVIRUS_BINARY` to the absolute ClamAV `clamscan` executable path. If antivirus is unavailable or fails, the file may remain in quarantine for investigation but its finding cannot be manually overridden and it cannot be released.

When signatures are stored outside ClamAV's default directory, set `KNOWLEDGE_ANTIVIRUS_DATABASE` to that directory. Keep signatures current with `freshclam` before processing uploads.

Run the queue worker for extraction:

```console
php artisan queue:work --queue=knowledge,default
```

Run the restricted index outbox worker on the normal schedule:

```console
php artisan pcs:process-ai-outbox
```

## Cut-off point template

Cut-off points must use CSV and include these headings exactly:

```csv
programme_code,academic_year,intake,entry_scheme,cutoff
ARD,2026/2027,Main Intake,Direct Entry,45.2
```

The document supplements canonical published programme records. It never silently edits programme data.

## Calculation guidance requirements

Calculation guidance must state all of the following before review can complete:

- required inputs and their permitted values;
- the formula or calculation steps;
- rounding rules;
- handling of missing or incomplete inputs;
- at least one worked example.

The uploaded text does not become executable code. A calculation must be implemented as a separately reviewed deterministic backend function. If instructions are incomplete or ambiguous, the system flags the gap rather than allowing the AI to infer a rule.

## Public answers and provenance

The public assistant receives only released chunks from the restricted AI schema. It must answer from supplied context, say when information is missing, and must not reveal internal source paths, hashes, findings or administrative citations. Internal source/version/chunk provenance is retained for auditing and rollback.
