import { createElement } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRequestTab,
  useWorkspaceStore,
} from "../stores/workspace";
import {
  buildGeneratedFiles,
  CodeGeneratorDialog,
  type Framework,
  type GeneratorConfig,
} from "./CodeGeneratorDialog";

vi.mock("@monaco-editor/react", async () => {
  const React = await import("react");
  return {
    default: ({ value }: { value?: string }) =>
      React.createElement("textarea", {
        "aria-label": "Generated code",
        readOnly: true,
        value,
      }),
  };
});

afterEach(() => {
  cleanup();
  useWorkspaceStore.setState({ codeGeneratorOpen: false });
});

function config(framework: Framework): GeneratorConfig {
  return {
    framework,
    packageName: "com.example.checkout",
    className: "CheckoutApiTest",
    buildSystem: "maven",
    assertions: {
      status: true,
      contentType: true,
      responseBody: true,
      responseTime: true,
    },
  };
}

describe("Java generator", () => {
  it("escapes multiline bodies and redacts secrets from generated files", () => {
    const tab = createRequestTab({
      method: "POST",
      body: `{
  "name": "Ada",
  "accessToken": "request-secret"
}`,
      response: {
        requestId: "request-1",
        statusCode: 200,
        status: "200 OK",
        durationMs: 10,
        sizeBytes: 20,
        contentType: "application/json",
        protocol: "HTTP/2",
        remoteAddr: "127.0.0.1",
        tls: "TLS 1.3",
        traceId: "trace-1",
        headers: {},
        cookies: [],
        body: `{"password":"response-secret","data":[]}`,
        rawBody: "",
        timeline: [],
        resolvedUrl: "https://example.test/v1/users",
      },
    });

    const files = buildGeneratedFiles(config("mockmvc"), tab);
    const source = files.find((file) => file.name === "Test class")?.content;
    const resource = files.find((file) => file.name === "Resource file")?.content;

    expect(source).toContain('.content("{\\n');
    expect(source).not.toContain("request-secret");
    expect(resource).not.toContain("response-secret");
    expect(`${source}\n${resource}`).toContain("{{SECRET}}");
  });

  it("includes runtime dependencies and WireMock's __files resource layout", () => {
    const tab = createRequestTab();
    const webClient = buildGeneratedFiles(config("web-client"), tab);
    const gradle = webClient.find(
      (file) => file.name === "Gradle dependency",
    )?.content;
    expect(gradle).toContain("reactor-test");
    expect(gradle).toContain("junit-jupiter");

    const wireMock = buildGeneratedFiles(config("wiremock"), tab);
    expect(
      wireMock.find((file) => file.name === "Resource file")?.relativePath,
    ).toBe("src/test/resources/__files/validex-response.json");
    expect(
      wireMock.find((file) => file.name === "Test class")?.content,
    ).toContain("new WireMockServer");
  });

  it("replays safe request details and derives assertions from the response", () => {
    const tab = createRequestTab({
      method: "POST",
      body: '{"name":"Ada"}',
      headers: [
        {
          id: "tenant",
          enabled: true,
          key: "X-Tenant",
          value: "commerce",
          source: "Manual",
        },
        {
          id: "token",
          enabled: true,
          key: "Authorization",
          value: "Bearer production-secret",
          source: "Manual",
        },
        {
          id: "content-type",
          enabled: true,
          key: "Content-Type",
          value: "application/json",
          source: "Manual",
        },
      ],
      response: {
        requestId: "request-2",
        statusCode: 201,
        status: "201 Created",
        durationMs: 20,
        sizeBytes: 2,
        contentType: "application/problem+json; charset=utf-8",
        protocol: "HTTP/2",
        remoteAddr: "127.0.0.1",
        tls: "TLS 1.3",
        traceId: "trace-2",
        headers: {},
        cookies: [],
        body: "{}",
        rawBody: "{}",
        timeline: [],
        resolvedUrl: "https://example.test/v1/users",
      },
    });
    const source = buildGeneratedFiles(config("rest-assured"), tab)[0].content;

    expect(source).toContain('.header("X-Tenant", "commerce")');
    expect(source).toContain(
      '.header("Content-Type", "application/json")',
    );
    expect(source).toContain(".body(");
    expect(source).toContain(".statusCode(201)");
    expect(source).toContain('.contentType("application/problem+json")');
    expect(source).not.toContain(
      '.header("Content-Type", "application/problem+json")',
    );
    expect(source).not.toContain("production-secret");
  });

  it("does not duplicate request headers", () => {
    const source = buildGeneratedFiles(
      config("rest-assured"),
      createRequestTab(),
    )[0].content;

    expect(source.match(/\.header\("Accept", "application\/json"\)/g)).toHaveLength(
      1,
    );
  });

  it("preserves DELETE request bodies for every generated client", () => {
    const tab = createRequestTab({
      method: "DELETE",
      url: "{{baseUrl}}/orders/42",
      body: '{"force":true}',
    });
    const markers: Record<Framework, string[]> = {
      "rest-assured": ['.delete("/orders/42")', ".body("],
      mockmvc: ['delete("/orders/42")', ".content("],
      webtestclient: [
        "client.method(HttpMethod.DELETE)",
        ".bodyValue(",
      ],
      wiremock: [
        'delete(urlEqualTo("/orders/42"))',
        ".withRequestBody(",
      ],
      "spring-cloud-contract": [
        'method "DELETE"',
        'body(file("validex-request.json"))',
      ],
      "http-client": [
        '.method("DELETE",',
        "HttpRequest.BodyPublishers.ofString(",
      ],
      "rest-client": [
        "client.method(HttpMethod.DELETE)",
        ".body(",
      ],
      "web-client": [
        "client.method(HttpMethod.DELETE)",
        ".bodyValue(",
      ],
    };

    for (const [framework, expected] of Object.entries(markers)) {
      const files = buildGeneratedFiles(
        config(framework as Framework),
        tab,
      );
      const source = files[0].content;
      for (const marker of expected) expect(source).toContain(marker);
      if (framework === "spring-cloud-contract") {
        expect(
          files.some(
            (file) =>
              file.relativePath ===
              "src/test/resources/contracts/validex-request.json",
          ),
        ).toBe(true);
      }
    }
  });

  it("updates the generated preview as soon as configuration changes", async () => {
    const tab = createRequestTab({
      id: "auto-preview",
      method: "GET",
      url: "https://example.test/orders",
    });
    useWorkspaceStore.setState({
      tabs: [tab],
      activeTabID: tab.id,
      codeGeneratorOpen: true,
    });

    render(
      createElement(
        Tooltip.Provider,
        null,
        createElement(CodeGeneratorDialog),
      ),
    );

    expect(
      (await screen.findByLabelText("Generated code") as HTMLTextAreaElement)
        .value,
    ).toContain("io.restassured");

    fireEvent.change(screen.getByLabelText("Framework"), {
      target: { value: "mockmvc" },
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Generated code") as HTMLTextAreaElement).value,
      ).toContain("MockMvc");
    });
  });

  it("produces valid identifiers, complete build files and a contract DSL", () => {
    const invalid = config("spring-cloud-contract");
    invalid.packageName = "com.123.class";
    invalid.className = "class";
    const tab = createRequestTab({
      method: "POST",
      body: '{"id":42}',
    });
    const files = buildGeneratedFiles(invalid, tab);

    expect(files[0].relativePath).toBe(
      "src/test/resources/contracts/classGenerated.groovy",
    );
    expect(files[0].content).toContain("Contract.make");
    expect(files[0].content).toContain('body(file("validex-request.json"))');
    expect(files.find((file) => file.name === "Maven dependency")).toMatchObject(
      {
        relativePath: "pom.xml",
      },
    );
    expect(
      files.find((file) => file.name === "Maven dependency")?.content,
    ).toContain("<project");
  });
});
