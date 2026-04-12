import { resolveStorageDriver } from "@agentchat/server";
import { describe, expect, it } from "vitest";

describe("storage driver selection", () => {
  it("defaults to sqlite without a database url", () => {
    expect(resolveStorageDriver({})).toBe("sqlite");
  });

  it("prefers postgres when a database url is present", () => {
    expect(
      resolveStorageDriver({
        databaseUrl: "postgres://postgres:postgres@127.0.0.1:5432/agentchat_test",
      }),
    ).toBe("postgres");
  });

  it("honors an explicit sqlite override", () => {
    expect(
      resolveStorageDriver({
        driver: "sqlite",
        databaseUrl: "postgres://postgres:postgres@127.0.0.1:5432/agentchat_test",
      }),
    ).toBe("sqlite");
  });
});
