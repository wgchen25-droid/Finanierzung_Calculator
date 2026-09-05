# Sanitized quotation fixture source report

The external fixture in [reference-data.json](../reference-data.json) is a
sanitized transcription of the user-provided 21-page financing proposal dated
2026-09-01. It contains no applicant name, address, property address,
telephone number, PIN, or source filename.

The source document SHA-256 is
\`4f64c61c5c781882bd69d144bd4c7c316803613b785743ef9a00e5ab9f74582c\`.

## Source coverage

- Budget values were checked against page 3.
- Commerzbank terms were checked against page 5; its repayment tables were
  checked against pages 8 and 9.
- ING terms were checked against page 12; its repayment tables were checked
  against pages 15 and 16.
- The period-0 disbursement row is intentionally excluded from \`schedule\`.
  Its negative \`Saldo\` sign is converted to the positive displayed balance.
- Dates are normalized from the source's \`DD.MM.YYYY\` format to ISO
  \`YYYY-MM-DD\` strings.

## Independent checks

Using the bundled Python runtime and \`pdfplumber\`, the rendered repayment
tables and extracted text were compared with the fixture:

- 24 schedule rows × 4 financial values for Commerzbank: 96 checks, 0
  mismatches.
- 24 schedule rows × 4 financial values for ING: 96 checks, 0 mismatches.
- End-of-fixed-rate summary totals on pages 9 and 16 matched each bank's
  \`paid\`, \`interest\`, and \`repaid\` values.
- Budget markers and the recorded terms on pages 3, 5, and 12 were present
  and matched the fixture.

Verification result: **192/192 repayment-table amount values matched exactly
to cents; exit code 0.**

The fixture records PDF interval rows as source data. The application must
run its own repayment engine for the corresponding benchmark and compare that
output with these values; the fixture does not substitute PDF values for
engine output.
