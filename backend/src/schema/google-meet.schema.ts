import { z } from "zod";

export const ImportGoogleMeetSchema = z.object({
  description: z.string().default(""),
  googleAccessToken: z.string().min(1),
  meetLinkOrCode: z.string().min(1),
  title: z.string().min(1).optional(),
});

export type ImportGoogleMeetInput = z.infer<typeof ImportGoogleMeetSchema>;
