import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  uid: z.string().optional(),
  name: z.string(),
  email: z.string().email(),
  authProvider: z.string().optional(),
});

export type User = z.infer<typeof UserSchema>;

export const FirebaseAuthHeaderSchema = z.object({
  authorization: z.string().min(1),
});
