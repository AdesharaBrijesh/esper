"use server";

import { requireUserId } from "@/lib/auth/dal";
import { parseOrThrow, revalidateAll, runAction } from "@/lib/actions/helpers";
import {
  bulkPaySchema,
  extendPlanSchema,
  installmentEditSchema,
  payInstallmentSchema,
  planSchema,
  type BulkPayInput,
  type ExtendPlanInput,
  type InstallmentEditInput,
  type PayInstallmentInput,
  type PlanInput,
} from "@/lib/validations/plan";
import {
  bulkPayInstallments,
  cancelPlan,
  createPlan,
  deletePlan,
  extendPlan,
  payInstallment,
  reactivatePlan,
  skipInstallment,
  unpayInstallment,
  updateInstallment,
  updatePlan,
} from "@/lib/services/plans";
import type { ActionResult } from "@/lib/types";

export async function createPlanAction(input: PlanInput): Promise<ActionResult<{ id: string; installments: number }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(planSchema, input);
    const result = await createPlan(userId, data);
    revalidateAll();
    return result;
  });
}

export async function updatePlanAction(id: string, input: PlanInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(planSchema, input);
    const result = await updatePlan(userId, id, data);
    revalidateAll();
    return result;
  });
}

export async function deletePlanAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    await deletePlan(userId, id);
    revalidateAll();
    return null;
  });
}

export async function cancelPlanAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    await cancelPlan(userId, id);
    revalidateAll();
    return null;
  });
}

export async function reactivatePlanAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    await reactivatePlan(userId, id);
    revalidateAll();
    return null;
  });
}

export async function extendPlanAction(input: ExtendPlanInput): Promise<ActionResult<{ added: number }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(extendPlanSchema, input);
    const result = await extendPlan(userId, data.planId, data.count);
    revalidateAll();
    return result;
  });
}

/** Marks one instalment paid, writing the transaction it implies. */
export async function payInstallmentAction(
  input: PayInstallmentInput,
): Promise<ActionResult<{ transactionId: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(payInstallmentSchema, input);
    const result = await payInstallment(userId, {
      installmentId: data.installmentId,
      paidDate: data.paidDate,
      amount: data.amount,
      fromAccountId: data.fromAccountId,
      paymentMode: data.paymentMode ?? null,
      notes: data.notes,
    });
    revalidateAll();
    return result;
  });
}

/**
 * Marks a run of instalments paid at once — the path for entering past years of fees
 * in a single action rather than one form at a time.
 */
export async function bulkPayAction(input: BulkPayInput): Promise<ActionResult<{ paid: number }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(bulkPaySchema, input);
    const result = await bulkPayInstallments(userId, {
      planId: data.planId,
      installmentIds: data.installmentIds,
      fromAccountId: data.fromAccountId,
      useDueDate: data.useDueDate,
      paidDate: data.paidDate,
    });
    revalidateAll();
    return result;
  });
}

/** Undoes a payment, deleting the transaction it created. */
export async function unpayInstallmentAction(installmentId: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    await unpayInstallment(userId, installmentId);
    revalidateAll();
    return null;
  });
}

export async function skipInstallmentAction(installmentId: string, skip: boolean): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    await skipInstallment(userId, installmentId, skip);
    revalidateAll();
    return null;
  });
}

export async function updateInstallmentAction(input: InstallmentEditInput): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(installmentEditSchema, input);
    await updateInstallment(userId, {
      installmentId: data.installmentId,
      amount: data.amount,
      dueDate: data.dueDate,
      label: data.label,
      notes: data.notes,
    });
    revalidateAll();
    return null;
  });
}
