import { describe, expect, it } from "vitest";
import { addGate, removeGate } from "./sectorEdit";

describe("sector gates from the map", () => {
  it("splits the tapped sector and names the new half", () => {
    expect(addGate([0.5], ["Topo", "Fundo"], 0.2504, "Novo")).toEqual({
      boundaries: [0.25, 0.5],
      names: ["Topo", "Novo", "Fundo"],
    });
    expect(addGate([0.25, 0.5], ["A", "B", "C"], 0.8, "D")).toEqual({
      boundaries: [0.25, 0.5, 0.8],
      names: ["A", "B", "C", "D"],
    });
  });

  it("ignores taps on top of a gate, the start or the finish", () => {
    expect(addGate([0.5], ["A", "B"], 0.51, "X")).toBeNull();
    expect(addGate([], ["A"], 0.005, "X")).toBeNull();
    expect(addGate([], ["A"], 0.995, "X")).toBeNull();
  });

  it("removes a gate and merges its sectors", () => {
    expect(removeGate([0.25, 0.5], ["A", "B", "C"], 0)).toEqual({ boundaries: [0.5], names: ["A", "C"] });
  });

  it("leaves mismatched names for the form to flag", () => {
    expect(addGate([0.5], ["Only"], 0.25, "X")?.names).toEqual(["Only"]);
  });
});
