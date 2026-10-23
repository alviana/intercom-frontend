import type { CallRef } from "../../utils/call-url";
import type { TJoinProductionOptions } from "../production-line/types";

export type LineNames = { productionName?: string; lineName?: string };

/** Join options for a line opened from the /calls URL. The names go into the native `meta`
 * (iOS widget title "PRODUÇÃO / LINHA"); omitted when the production fetch failed. */
export const buildAutoJoinOptions = (
  ref: CallRef,
  username: string,
  audioinput: string | undefined,
  names: LineNames | undefined
): TJoinProductionOptions => ({
  productionId: ref.productionId,
  lineId: ref.lineId,
  username,
  audioinput,
  lineUsedForProgramOutput: ref.role === "l" || ref.role === "p",
  isProgramUser: ref.role === "p",
  ...(names?.lineName ? { lineName: names.lineName } : {}),
  ...(names?.productionName ? { productionName: names.productionName } : {}),
});
