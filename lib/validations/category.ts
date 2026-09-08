import { z } from "zod";
import { CATEGORY_TYPES } from "@/lib/constants";
import { hexColorSchema } from "./common";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters"),
  type: z.enum(CATEGORY_TYPES, { message: "Choose a category type" }),
  icon: z
    .string()
    .trim()
    .max(16, "Icon is too long")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  color: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(hexColorSchema.nullable()),
  isActive: z.boolean().optional().default(true),
});
export type CategoryInput = z.input<typeof categorySchema>;
export type CategoryData = z.output<typeof categorySchema>;
