import { z } from "zod";
export const categories = ["Facilities", "Learning", "Safety", "Student life", "Other"] as const;
export const submissionSchema = z.object({
  title: z.string().trim().min(8, "Add a more specific title.").max(120),
  description: z.string().trim().min(20, "Please include a little more detail.").max(2000),
  category: z.enum(categories),
  isAnonymous: z.boolean(),
  consent: z.literal(true, { errorMap: () => ({ message: "Please accept the privacy notice." }) })
});
export type Submission = z.infer<typeof submissionSchema>;
