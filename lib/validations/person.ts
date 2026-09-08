import { z } from "zod";
import { optionalText } from "./common";

export const personSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Keep the name under 60 characters"),
  phone: z
    .string()
    .trim()
    .max(20, "Phone is too long")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  notes: optionalText(500),
});
export type PersonInput = z.input<typeof personSchema>;
export type PersonData = z.output<typeof personSchema>;
