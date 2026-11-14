-- Additive backfill: give every existing loan transaction the person it belongs to, so a
-- person's ledger balance can be read straight off "Transaction"."personId".
-- Only fills the new, empty column. Types, amounts, accounts and loans are untouched.
UPDATE "Transaction" t
SET "personId" = l."personId"
FROM "Loan" l
WHERE t."loanId" = l."id"
  AND t."personId" IS NULL;
