import { describe, expect, it } from "vitest";
import { createRequestTab } from "../stores/workspace";
import {
  buildGeneratedFiles,
  type Framework,
  type GeneratorConfig,
} from "./CodeGeneratorDialog";

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
    ).toBe("src/test/resources/__files/lazytest-response.json");
    expect(
      wireMock.find((file) => file.name === "Test class")?.content,
    ).toContain("new WireMockServer");
  });

  it("replays safe request details and derives assertions from the response", () => {
    const tab = createRequestTab({
      method: "POST",
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
    expect(source).toContain(".body(");
    expect(source).toContain(".statusCode(201)");
    expect(source).toContain('.contentType("application/problem+json")');
    expect(source).not.toContain("production-secret");
  });

  it("produces valid identifiers, complete build files and a contract DSL", () => {
    const invalid = config("spring-cloud-contract");
    invalid.packageName = "com.123.class";
    invalid.className = "class";
    const tab = createRequestTab({ method: "POST" });
    const files = buildGeneratedFiles(invalid, tab);

    expect(files[0].relativePath).toBe(
      "src/test/resources/contracts/classGenerated.groovy",
    );
    expect(files[0].content).toContain("Contract.make");
    expect(files[0].content).toContain('body(file("lazytest-request.json"))');
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
