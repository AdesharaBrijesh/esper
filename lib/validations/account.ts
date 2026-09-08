import { z } from "zod";
import { ACCOUNT_TYPES, OWNERS } from "@/lib/constants";
import { signedMoneyString } from "./common";

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters"),
  type: z.enum(ACCOUNT_TYPES, { message: "Choose an account type" }),
  owner: z.enum(OWNERS, { message: "Choose an owner" }),
  openingBalance: signedMoneyString,
  isActive: z.boolean().optional().default(true),
});
export type AccountInput = z.input<typeof accountSchema>;
export type AccountData = z.output<typeof accountSchema>;
