import { z } from "zod";
import { SIGNALING_PORT } from "@mobile-remote/protocol";

export const connectFormSchema = z.object({
  host: z
    .string()
    .min(1, "Enter the laptop's IP address")
    .regex(/^\d{1,3}(\.\d{1,3}){3}$/, "Enter a valid IPv4 address, e.g. 192.168.1.20"),
  port: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(SIGNALING_PORT),
  pin: z
    .string()
    .min(4, "Enter the PIN shown on the laptop")
    .max(12),
});

export type ConnectFormValues = z.infer<typeof connectFormSchema>;
