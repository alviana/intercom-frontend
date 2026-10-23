import { describe, it, expect } from "vitest";
import { buildAutoJoinOptions } from "./auto-join-options";

describe("buildAutoJoinOptions", () => {
  it("carries production and line names for the native widget", () => {
    const o = buildAutoJoinOptions(
      { productionId: "7", lineId: "3" },
      "ana",
      "mic",
      { productionName: "Jornal", lineName: "Estúdio" }
    );
    expect(o).toEqual({
      productionId: "7",
      lineId: "3",
      username: "ana",
      audioinput: "mic",
      lineUsedForProgramOutput: false,
      isProgramUser: false,
      lineName: "Estúdio",
      productionName: "Jornal",
    });
    expect(JSON.parse(JSON.stringify(o)).productionName).toBe("Jornal");
  });

  it("omits names when unknown and keeps the program roles", () => {
    const o = buildAutoJoinOptions(
      { productionId: "7", lineId: "4", role: "p" },
      "ana",
      undefined,
      undefined
    );
    expect(o).not.toHaveProperty("lineName");
    expect(o).not.toHaveProperty("productionName");
    expect(o.lineUsedForProgramOutput).toBe(true);
    expect(o.isProgramUser).toBe(true);
  });
});
