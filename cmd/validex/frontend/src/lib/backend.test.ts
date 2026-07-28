import { afterEach, describe, expect, it, vi } from "vitest";

import { backend } from "./backend";
import type { BootstrapData } from "./types";

type NativeBridge = NonNullable<
  NonNullable<Window["canbridge"]>["Bridge"]
>;

afterEach(() => {
  delete window.canbridge;
});

describe("canbridge adapter", () => {
  it("forwards calls through window.canbridge.Bridge", async () => {
    const bootstrap: BootstrapData = {
      appVersion: "test",
      workspaceId: "native-workspace",
      workspaceName: "Native Workspace",
      environments: [],
      collections: [],
      history: [],
      recentUrls: [],
      onboardingSteps: [],
    };
    const Bootstrap = vi.fn().mockResolvedValue(bootstrap);
    window.canbridge = {
      Bridge: { Bootstrap } as unknown as NativeBridge,
    };

    await expect(backend.bootstrap()).resolves.toEqual(bootstrap);
    expect(Bootstrap).toHaveBeenCalledOnce();
  });

  it("forwards versioned collection library documents unchanged", async () => {
    const document =
      '{"state":{"collections":[],"requests":[],"expandedCollectionIds":[]},"version":1}';
    const LoadCollectionLibrary = vi.fn().mockResolvedValue({
      data: document,
      found: true,
    });
    const SaveCollectionLibrary = vi.fn().mockResolvedValue({
      saved: true,
    });
    window.canbridge = {
      Bridge: {
        LoadCollectionLibrary,
        SaveCollectionLibrary,
      } as unknown as NativeBridge,
    };

    await expect(backend.loadCollectionLibrary()).resolves.toEqual({
      data: document,
      found: true,
    });
    await expect(backend.saveCollectionLibrary(document)).resolves.toEqual({
      saved: true,
    });
    expect(LoadCollectionLibrary).toHaveBeenCalledOnce();
    expect(SaveCollectionLibrary).toHaveBeenCalledWith(document);
  });

  it("returns an explicit error when native collection storage is unavailable", async () => {
    await expect(backend.loadCollectionLibrary()).resolves.toMatchObject({
      data: "",
      found: false,
      error: { code: "backend_unavailable" },
    });
    await expect(backend.saveCollectionLibrary("{}")).resolves.toMatchObject({
      saved: false,
      error: { code: "backend_unavailable" },
    });
  });

  it("normalizes required native collections at the bridge boundary", async () => {
    const ImportOpenAPI = vi.fn().mockResolvedValue({
      specId: "spec-1",
      path: "/tmp/openapi.yaml",
      title: "Tagless API",
      version: "1.0.0",
      baseUrl: "",
      endpoints: [
        {
          id: "listUsers",
          method: "GET",
          path: "/users",
          summary: "List users",
          tags: null,
        },
      ],
      canceled: false,
    });
    const InspectActuator = vi.fn().mockResolvedValue({
      metrics: { capturedAt: "", metrics: null },
      deltas: null,
      error: {
        code: "diagnostic_failed",
        title: "Failed",
        message: "offline",
      },
    });
    window.canbridge = {
      Bridge: {
        ImportOpenAPI,
        InspectActuator,
      } as unknown as NativeBridge,
    };

    await expect(backend.importOpenAPI()).resolves.toMatchObject({
      endpoints: [{ tags: [] }],
    });
    await expect(
      backend.inspectActuator({
        baseUrl: "http://localhost:8080/actuator",
        headers: {},
        timeoutMs: 1_000,
        metricNames: [],
        includeMappings: false,
      }),
    ).resolves.toMatchObject({
      metrics: { metrics: {} },
      deltas: [],
    });
  });
});
