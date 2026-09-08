"use server";

import { requireUserId } from "@/lib/auth/dal";
import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/services/transactions";
import { revalidateAll, runAction } from "@/lib/actions/helpers";
import type { ActionResult } from "@/lib/types";
import type { TransactionInput } from "@/lib/validations/transaction";

export async function createTransactionAction(
  input: TransactionInput,
): Promise<ActionResult<{ id: string; loanId: string | null }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const result = await createTransaction(userId, input);
    revalidateAll();
    return result;
  });
}

export async function updateTransactionAction(id: string, input: TransactionInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const result = await updateTransaction(userId, id, input);
    revalidateAll();
    return result;
  });
}

export async function deleteTransactionAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    await deleteTransaction(userId, id);
    revalidateAll();
    return null;
  });
}
