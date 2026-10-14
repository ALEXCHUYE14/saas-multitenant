import { z } from "zod";

/** Regla única de contraseñas (registro, recuperación y cambio desde el perfil). */
export const passwordSchema = z
  .string()
  .min(8, "Usa al menos 8 caracteres.")
  .max(72, "Usa como máximo 72 caracteres.")
  .regex(/[0-9]/, "Incluye al menos un número.")
  .regex(/[a-zA-Z]/, "Incluye al menos una letra.");
