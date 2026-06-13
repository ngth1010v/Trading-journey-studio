import { z } from "zod";

const symbolSchema = z.string().trim().min(1).max(64);
const timeframeSchema = z.string().trim().regex(/^[1-9][0-9]*(S|M|H|D|W|MN|Y)$/);
const unixTimestampSchema = z.coerce.number().int().min(0);
const limitSchema = z.coerce.number().int().min(1).max(10_000);

export const symbolParamSchema = z.object({
  symbol: symbolSchema,
});

export const timeframeParamSchema = z.object({
  symbol: symbolSchema,
  timeframe: timeframeSchema,
});

export const ohlcQuerySchema = z
  .object({
    timeframe: timeframeSchema,
    from: z.coerce.number().int().min(0).optional(),
    to: z.coerce.number().int().min(0).optional(),
    limit: limitSchema.optional(),
  })
  .refine((value) => {
    const hasFrom = value.from !== undefined;
    const hasTo = value.to !== undefined;
    const hasLimit = value.limit !== undefined;
    return (
      (hasFrom && hasTo && !hasLimit) ||
      (hasFrom && hasLimit && !hasTo) ||
      (hasTo && hasLimit && !hasFrom)
    );
  }, {
    message: "use from+to, from+limit, or to+limit",
  })
  .refine((value) => {
    if (value.from !== undefined && value.to !== undefined) {
      return value.from < value.to;
    }
    return true;
  }, {
    message: "from must be lower than to",
  });

export type OhlcQuery = z.infer<typeof ohlcQuerySchema>;
