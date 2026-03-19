import * as z from "zod/v4";

function getDef(t: z.ZodType) {
  return (t as z.ZodType & { _def?: { type?: string; innerType?: z.ZodType } })._def;
}

export function isZodType(t: z.ZodType, type: string): boolean {
  const def = getDef(t);
  if (!def) {
    return false;
  }
  if (def.type === type) {
    return true;
  }
  if (def.type === "pipe") {
    const pipeDef = def as unknown as {
      in: z.ZodType;
      out: z.ZodType;
    };
    return isZodType(pipeDef.in, type) || isZodType(pipeDef.out, type);
  }
  if (def.innerType) {
    return isZodType(def.innerType, type);
  }
  return false;
}
