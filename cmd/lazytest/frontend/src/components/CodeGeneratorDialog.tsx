import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Check,
  Clipboard,
  Download,
  FileArchive,
  FileCode2,
  FolderOutput,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { backend } from "../lib/backend";
import type { GeneratedFile, RequestTab } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, IconButton } from "./ui";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((module) => ({ default: module.default })),
);

export type Framework =
  | "rest-assured"
  | "mockmvc"
  | "webtestclient"
  | "wiremock"
  | "spring-cloud-contract"
  | "http-client"
  | "rest-client"
  | "web-client";

export interface GeneratorConfig {
  framework: Framework;
  packageName: string;
  className: string;
  buildSystem: "maven" | "gradle";
  assertions: {
    status: boolean;
    contentType: boolean;
    responseBody: boolean;
    responseTime: boolean;
  };
}

const frameworks: Array<{
  id: Framework;
  label: string;
  detail: string;
}> = [
  { id: "rest-assured", label: "REST Assured Test", detail: "JUnit 5" },
  { id: "mockmvc", label: "MockMvc Test", detail: "Spring MVC" },
  { id: "webtestclient", label: "WebTestClient Test", detail: "Reactive" },
  { id: "wiremock", label: "WireMock Stub", detail: "Stub server" },
  {
    id: "spring-cloud-contract",
    label: "Spring Cloud Contract",
    detail: "Contract test",
  },
  { id: "http-client", label: "Java HttpClient", detail: "JDK 21" },
  { id: "rest-client", label: "Spring RestClient", detail: "Spring 6" },
  { id: "web-client", label: "Spring WebClient", detail: "Reactive client" },
];

function supportsAssertion(
  framework: Framework,
  assertion: keyof GeneratorConfig["assertions"],
) {
  if (framework === "wiremock") return false;
  if (framework === "spring-cloud-contract") {
    return assertion === "responseBody";
  }
  if (assertion !== "responseTime") return true;
  return (
    framework === "rest-assured" ||
    framework === "http-client" ||
    framework === "rest-client"
  );
}

function javaString(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t")
    .replaceAll("\u0008", "\\b")
    .replaceAll("\u000c", "\\f")
    .replace(/[\u0000-\u0007\u000b\u000e-\u001f\u2028\u2029]/g, (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
}

const secretKeyPattern =
  /authorization|api[-_.]?key|access[-_.]?token|refresh[-_.]?token|token|password|passwd|secret|credential/i;

function redactSecrets(value: unknown, parentKey = ""): unknown {
  if (secretKeyPattern.test(parentKey)) return "{{SECRET}}";
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, parentKey));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactSecrets(item, key),
      ]),
    );
  }
  return value;
}

function safeJSONFixture(content: string, fallback: string) {
  try {
    return `${JSON.stringify(redactSecrets(JSON.parse(content)), null, 2)}\n`;
  } catch {
    return fallback;
  }
}

function requestPath(url: string) {
  const withoutVariable = url.replace(/^\{\{\s*baseUrl\s*}}/, "");
  try {
    const parsed = new URL(withoutVariable, "http://lazytest.local");
    for (const key of [...parsed.searchParams.keys()]) {
      if (secretKeyPattern.test(key)) parsed.searchParams.set(key, "{{SECRET}}");
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return withoutVariable.startsWith("/") ? withoutVariable : `/${withoutVariable}`;
  }
}

const javaKeywords = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "record",
  "return",
  "sealed",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "var",
  "void",
  "volatile",
  "while",
  "yield",
]);

function javaIdentifier(value: string, fallback: string) {
  let normalized = value.replace(/[^A-Za-z0-9_$]/g, "");
  if (!normalized) normalized = fallback;
  if (!/^[A-Za-z_$]/.test(normalized)) normalized = `_${normalized}`;
  if (javaKeywords.has(normalized.toLowerCase())) normalized = `${normalized}_`;
  return normalized;
}

function safePackage(value: string) {
  const normalized = value
    .split(".")
    .map((part) => javaIdentifier(part.toLowerCase(), "api"))
    .filter(Boolean)
    .join(".");
  return normalized || "com.example.api";
}

function safeClassName(value: string) {
  const normalized = javaIdentifier(value, "GeneratedApiTest");
  if (javaKeywords.has(normalized.replace(/_$/, "").toLowerCase())) {
    return `${normalized.replace(/_$/, "")}Generated`;
  }
  return normalized;
}

function assertionLines(
  config: GeneratorConfig,
  expectedStatus: number,
  expectedContentType: string,
  indent = "        ",
) {
  const lines: string[] = [];
  if (config.assertions.status) {
    lines.push(`${indent}.statusCode(${expectedStatus})`);
  }
  if (config.assertions.contentType) {
    lines.push(`${indent}.contentType("${javaString(expectedContentType)}")`);
  }
  if (config.assertions.responseBody) {
    lines.push(`${indent}.body(not(emptyString()))`);
  }
  if (config.assertions.responseTime) {
    lines.push(`${indent}.time(lessThan(2000L))`);
  }
  return lines.join("\n");
}

function mainSource(config: GeneratorConfig, tab: RequestTab) {
  const packageName = safePackage(config.packageName);
  const className = safeClassName(config.className);
  const path = javaString(requestPath(tab.url));
  const method = tab.method.toLowerCase();
  const expectedStatus =
    tab.response?.statusCode ?? (tab.method === "POST" ? 201 : 200);
  const expectedContentType =
    tab.response?.contentType?.split(";")[0]?.trim() || "application/json";
  const escapedContentType = javaString(expectedContentType);
  const hasBody = ["POST", "PUT", "PATCH"].includes(tab.method);
  const sanitizedRequestBody = safeJSONFixture(
    tab.body || "{}",
    '{\n  "_lazytest": "Non-JSON request body omitted; review before use."\n}\n',
  );
  const body = javaString(sanitizedRequestBody);
  const safeHeaders = tab.headers.filter(
    (header) =>
      header.enabled &&
      header.key.trim() &&
      !secretKeyPattern.test(header.key) &&
      !secretKeyPattern.test(header.value),
  );
  const headerChain = (indent: string) =>
    safeHeaders
      .map(
        (header) =>
          `${indent}.header("${javaString(header.key)}", "${javaString(header.value)}")`,
      )
      .join("\n");
  const mockAssertions = [
    config.assertions.status
      ? `.andExpect(status().is(${expectedStatus}))`
      : "",
    config.assertions.contentType
      ? `.andExpect(content().contentTypeCompatibleWith("${escapedContentType}"))`
      : "",
    config.assertions.responseBody
      ? ".andExpect(content().string(not(emptyString())))"
      : "",
  ].filter(Boolean);
  const mockTail = mockAssertions.length
    ? `\n${mockAssertions.map((line) => `            ${line}`).join("\n")};`
    : ".andReturn();";
  const webTestAssertions = [
    config.assertions.status
      ? `.expectStatus().isEqualTo(${expectedStatus})`
      : "",
    config.assertions.contentType
      ? `.expectHeader().contentTypeCompatibleWith("${escapedContentType}")`
      : "",
    config.assertions.responseBody
      ? ".expectBody().consumeWith(result -> assertTrue(result.getResponseBody().length > 0))"
      : "",
  ].filter(Boolean);
  const webTestTail = webTestAssertions.length
    ? `\n${webTestAssertions.map((line) => `            ${line}`).join("\n")};`
    : ";";
  const junitResponseAssertions = [
    config.assertions.status
      ? `        assertEquals(${expectedStatus}, response.statusCode());`
      : "",
    config.assertions.contentType
      ? `        assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("${escapedContentType}"));`
      : "",
    config.assertions.responseBody
      ? "        assertFalse(response.body().isBlank());"
      : "",
    config.assertions.responseTime
      ? '        assertTrue(elapsedMs < 2_000, "Response took " + elapsedMs + " ms");'
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const restClientAssertions = [
    config.assertions.status
      ? `        assertThat(response.getStatusCode().value()).isEqualTo(${expectedStatus});`
      : "",
    config.assertions.contentType
      ? `        assertThat(response.getHeaders().getContentType().toString()).startsWith("${escapedContentType}");`
      : "",
    config.assertions.responseBody
      ? "        assertThat(response.getBody()).isNotBlank();"
      : "",
    config.assertions.responseTime
      ? "        assertThat(elapsedMs).isLessThan(2_000L);"
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  switch (config.framework) {
    case "mockmvc":
      return `package ${packageName};

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.${method};
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ${className} {
    @Autowired MockMvc mockMvc;

    @Test
    void ${method}RequestMatchesContract() throws Exception {
        mockMvc.perform(${method}("${path}")${
          headerChain("                ")
            ? `\n${headerChain("                ")}`
            : ""
        }${
          hasBody
            ? `\n                .contentType(MediaType.parseMediaType("${escapedContentType}"))\n                .content("${body}")`
            : ""
        })${mockTail}
    }
}
`;
    case "webtestclient":
      return `package ${packageName};

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ${className} {
    @Autowired WebTestClient client;

    @Test
    void ${method}RequestMatchesContract() {
        client.${method}()
            .uri("${path}")${
              headerChain("            ")
                ? `\n${headerChain("            ")}`
                : ""
            }${hasBody ? `\n            .bodyValue("${body}")` : ""}
            .exchange()${webTestTail}
    }
}
`;
    case "wiremock":
      return `package ${packageName};

import static com.github.tomakehurst.wiremock.client.WireMock.*;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ${className} {
    private WireMockServer server;

    @BeforeEach
    void startServer() {
        server = new WireMockServer(WireMockConfiguration.options().dynamicPort());
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop();
    }

    @Test
    void stub${safeClassName(tab.name)}() {
        server.stubFor(${method}(urlEqualTo("${path}"))
            .willReturn(aResponse()
                .withStatus(${expectedStatus})
                .withHeader("Content-Type", "${escapedContentType}")
                .withBodyFile("lazytest-response.json")));
    }
}
`;
    case "spring-cloud-contract":
      return `import org.springframework.cloud.contract.spec.Contract

Contract.make {
    description "Generated from LazyTest request: ${javaString(tab.name)}"
    request {
        method "${tab.method}"
        url "${path}"
        headers {
            contentType("${escapedContentType}")
${safeHeaders
  .map(
    (header) =>
      `            header("${javaString(header.key)}", "${javaString(header.value)}")`,
  )
  .join("\n")}
        }
${hasBody ? '        body(file("lazytest-request.json"))' : ""}
    }
    response {
        status ${expectedStatus}
        headers {
            contentType("${escapedContentType}")
        }
${config.assertions.responseBody ? '        body(file("lazytest-response.json"))' : ""}
    }
}
`;
    case "http-client":
      return `package ${packageName};

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;

class ${className} {
    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void ${method}RequestReturnsSuccess() throws Exception {
        var baseUrl = System.getenv().getOrDefault("BASE_URL", "http://localhost:8080");
        var request = HttpRequest.newBuilder(URI.create(baseUrl + "${path}"))
            .header("Accept", "${escapedContentType}")${
              headerChain("            ")
                ? `\n${headerChain("            ")}`
                : ""
            }
            .method("${tab.method}", ${
              hasBody
                ? `HttpRequest.BodyPublishers.ofString("${body}")`
                : "HttpRequest.BodyPublishers.noBody()"
            })
            .build();

        var startedAt = System.nanoTime();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        var elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;
${junitResponseAssertions || "        // No response assertions selected."}
    }
}
`;
    case "rest-client":
      return `package ${packageName};

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class ${className} {
    private final RestClient client = RestClient.create(
        System.getenv().getOrDefault("BASE_URL", "http://localhost:8080")
    );

    @Test
    void ${method}RequestReturnsSuccess() {
        var startedAt = System.nanoTime();
        var response = client.${method}()
            .uri("${path}")${
              headerChain("            ")
                ? `\n${headerChain("            ")}`
                : ""
            }${hasBody ? `\n            .body("${body}")` : ""}
            .retrieve()
            .toEntity(String.class);
        var elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;

${restClientAssertions || "        // No response assertions selected."}
    }
}
`;
    case "web-client":
      return `package ${packageName};

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.test.StepVerifier;

class ${className} {
    private final WebClient client = WebClient.create(
        System.getenv().getOrDefault("BASE_URL", "http://localhost:8080")
    );

    @Test
    void ${method}RequestReturnsSuccess() {
        var response = client.${method}()
            .uri("${path}")${
              headerChain("            ")
                ? `\n${headerChain("            ")}`
                : ""
            }${hasBody ? `\n            .bodyValue("${body}")` : ""}
            .retrieve()
            .toEntity(String.class);

        StepVerifier.create(response)
            .assertNext(entity -> {
${[
  config.assertions.status
    ? `                assertEquals(${expectedStatus}, entity.getStatusCode().value());`
    : "",
  config.assertions.contentType
    ? `                assertTrue(entity.getHeaders().getContentType().toString().startsWith("${escapedContentType}"));`
    : "",
  config.assertions.responseBody
    ? "                assertNotNull(entity.getBody());\n                assertFalse(entity.getBody().isBlank());"
    : "",
]
  .filter(Boolean)
  .join("\n") || "                // No response assertions selected."}
            })
            .verifyComplete();
    }
}
`;
    case "rest-assured":
    default: {
      const assertions =
        assertionLines(config, expectedStatus, expectedContentType) ||
        `        .statusCode(${expectedStatus})`;
      return `package ${packageName};

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import org.junit.jupiter.api.Test;

class ${className} {
    @Test
    void ${method}RequestMatchesContract() {
        given()
            .baseUri(System.getenv().getOrDefault("BASE_URL", "http://localhost:8080"))
            .header("Accept", "${escapedContentType}")${
              headerChain("            ")
                ? `\n${headerChain("            ")}`
                : ""
            }${
              hasBody
                ? `\n            .contentType("${escapedContentType}")\n            .body("${body}")`
                : ""
            }
        .when()
            .${method}("${path}")
        .then()
${assertions};
    }
}
`;
    }
  }
}

function dependency(config: GeneratorConfig, buildSystem: "maven" | "gradle") {
  const junit = ["org.junit.jupiter", "junit-jupiter", "5.13.4"] as const;
  const coordinates: Record<
    Framework,
    ReadonlyArray<readonly [string, string, string]>
  > = {
    "rest-assured": [
      ["io.rest-assured", "rest-assured", "5.5.6"],
      junit,
    ],
    mockmvc: [
      ["org.springframework.boot", "spring-boot-starter-test", "3.5.4"],
    ],
    webtestclient: [
      ["org.springframework.boot", "spring-boot-starter-webflux", "3.5.4"],
      ["org.springframework.boot", "spring-boot-starter-test", "3.5.4"],
    ],
    wiremock: [
      ["org.wiremock", "wiremock-standalone", "3.13.1"],
      junit,
    ],
    "spring-cloud-contract": [
      [
        "org.springframework.cloud",
        "spring-cloud-starter-contract-verifier",
        "4.3.0",
      ],
      junit,
    ],
    "http-client": [junit],
    "rest-client": [
      ["org.springframework", "spring-web", "6.2.9"],
      ["org.assertj", "assertj-core", "3.27.3"],
      junit,
    ],
    "web-client": [
      ["org.springframework", "spring-webflux", "6.2.9"],
      ["io.projectreactor", "reactor-test", "3.7.8"],
      junit,
    ],
  };
  const selected = coordinates[config.framework];
  if (buildSystem === "gradle") {
    const lines = selected
      .map(
        ([group, artifact, version]) =>
          `    testImplementation("${group}:${artifact}:${version}")`,
      )
      .join("\n");
    return `plugins {
    id("java")
${config.framework === "spring-cloud-contract" ? '    id("org.springframework.cloud.contract") version "4.3.0"' : ""}
}

repositories {
    mavenCentral()
}

dependencies {
${lines}
}

tasks.test {
    useJUnitPlatform()
}
`;
  }
  const dependencies = selected
    .map(
      ([group, artifact, version]) => `<dependency>
  <groupId>${group}</groupId>
  <artifactId>${artifact}</artifactId>
  <version>${version}</version>
  <scope>test</scope>
</dependency>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>lazytest-generated</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
${dependencies
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.5.3</version>
      </plugin>
${
  config.framework === "spring-cloud-contract"
    ? `      <plugin>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-contract-maven-plugin</artifactId>
        <version>4.3.0</version>
        <extensions>true</extensions>
      </plugin>`
    : ""
}
    </plugins>
  </build>
</project>
`;
}

export function buildGeneratedFiles(
  config: GeneratorConfig,
  tab: RequestTab,
): GeneratedFile[] {
  const packageName = safePackage(config.packageName);
  const packagePath = packageName.replaceAll(".", "/");
  const className = safeClassName(config.className);
  const sourceRoot = `src/test/java/${packagePath}`;
  const contract = config.framework === "spring-cloud-contract";
  const files: GeneratedFile[] = [
    {
      name: contract ? "Contract" : "Test class",
      relativePath: contract
        ? `src/test/resources/contracts/${className}.groovy`
        : `${sourceRoot}/${className}.java`,
      content: mainSource(config, tab),
    },
    {
      name: "Fixture",
      relativePath: `${sourceRoot}/ApiFixture.java`,
      content: `package ${packageName};

final class ApiFixture {
    static final String BASE_URL =
        System.getenv().getOrDefault("BASE_URL", "http://localhost:8080");

    private ApiFixture() {}
}
`,
    },
    {
      name: "Helper",
      relativePath: `${sourceRoot}/ResponseAssertions.java`,
      content: `package ${packageName};

import static org.junit.jupiter.api.Assertions.*;

final class ResponseAssertions {
    static void isSuccessful(int status, String body) {
        assertTrue(status >= 200 && status < 300, "Unexpected status: " + status);
        assertNotNull(body);
    }

    private ResponseAssertions() {}
}
`,
    },
    {
      name: "Maven dependency",
      relativePath: "pom.xml",
      content: dependency(config, "maven"),
    },
    {
      name: "Gradle dependency",
      relativePath: "build.gradle",
      content: dependency(config, "gradle"),
    },
    {
      name: "Resource file",
      relativePath:
        config.framework === "wiremock"
          ? "src/test/resources/__files/lazytest-response.json"
          : contract
            ? "src/test/resources/contracts/lazytest-response.json"
          : "src/test/resources/lazytest-response.json",
      content: safeJSONFixture(
        tab.response?.body || '{\n  "data": []\n}\n',
        '{\n  "_lazytest": "Non-JSON response omitted; review before use."\n}\n',
      ),
    },
  ];
  if (contract && ["POST", "PUT", "PATCH"].includes(tab.method)) {
    files.push({
      name: "Request resource",
      relativePath: "src/test/resources/contracts/lazytest-request.json",
      content: safeJSONFixture(
        tab.body || "{}",
        '{\n  "_lazytest": "Non-JSON request body omitted; review before use."\n}\n',
      ),
    });
  }
  return files;
}

function editorLanguage(path: string) {
  if (path.endsWith(".java")) return "java";
  if (path.endsWith(".xml")) return "xml";
  if (path.endsWith(".json")) return "json";
  return "groovy";
}

export function CodeGeneratorDialog() {
  const open = useWorkspaceStore((state) => state.codeGeneratorOpen);
  const setOpen = useWorkspaceStore((state) => state.setCodeGeneratorOpen);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const activeTab =
    tabs.find((candidate) => candidate.id === activeTabID) ?? tabs[0];
  const [config, setConfig] = useState<GeneratorConfig>({
    framework: "rest-assured",
    packageName: "com.example.api",
    className: "ListUsersApiTest",
    buildSystem: "maven",
    assertions: {
      status: true,
      contentType: true,
      responseBody: true,
      responseTime: false,
    },
  });
  const [generatedConfig, setGeneratedConfig] = useState(config);
  const files = useMemo(
    () => (activeTab ? buildGeneratedFiles(generatedConfig, activeTab) : []),
    [activeTab, generatedConfig],
  );
  const [activeFilePath, setActiveFilePath] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    tone: "success" | "danger";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const activeFile =
    files.find((file) => file.relativePath === activeFilePath) ?? files[0];

  useEffect(() => {
    if (
      files[0] &&
      !files.some((file) => file.relativePath === activeFilePath)
    ) {
      setActiveFilePath(files[0].relativePath);
    }
  }, [activeFilePath, files]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!activeTab) return null;

  const showNotice = (
    text: string,
    tone: "success" | "danger" = "success",
  ) => setNotice({ text, tone });

  const updateAssertion = (key: keyof GeneratorConfig["assertions"]) => {
    setConfig((current) => ({
      ...current,
      assertions: {
        ...current.assertions,
        [key]: !current.assertions[key],
      },
    }));
  };

  const copyCurrent = async () => {
    if (!activeFile) return;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard kullanılamıyor.");
      await navigator.clipboard.writeText(activeFile.content);
      showNotice(`${activeFile.name} panoya kopyalandı.`);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Kod kopyalanamadı.",
        "danger",
      );
    }
  };

  const saveCurrent = async () => {
    if (!activeFile) return;
    setBusy(true);
    try {
      const result = await backend.saveGeneratedFile(
        activeFile.relativePath.split("/").at(-1) ?? activeFile.name,
        activeFile.content,
      );
      if (result.error) showNotice(result.error.message, "danger");
      else if (!result.canceled) showNotice(`Dosya kaydedildi: ${result.path}`);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Dosya kaydedilemedi.",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  const exportProject = async () => {
    setBusy(true);
    try {
      const selectedBuildFile =
        generatedConfig.buildSystem === "maven"
          ? "Maven dependency"
          : "Gradle dependency";
      const exportFiles = files.filter(
        (file) =>
          !file.name.endsWith("dependency") || file.name === selectedBuildFile,
      );
      const result = await backend.exportGeneratedProject(
        `${safeClassName(generatedConfig.className)}-lazytest`,
        exportFiles,
      );
      if (result.error) showNotice(result.error.message, "danger");
      else if (!result.canceled) {
        showNotice(`${result.count} dosya dışa aktarıldı: ${result.path}`);
      }
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Proje dışa aktarılamadı.",
        "danger",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog codegen-dialog">
          <div className="dialog-header codegen-header">
            <div>
              <Dialog.Title>Generate Java test</Dialog.Title>
              <Dialog.Description>
                {activeTab.method} {activeTab.name} için çalıştırılabilir Java
                veya contract başlangıç kodu üretin.
              </Dialog.Description>
            </div>
            <div className="codegen-header-actions">
              <Button
                size="sm"
                onClick={() => {
                  setGeneratedConfig({
                    ...config,
                    assertions: { ...config.assertions },
                  });
                  showNotice("Kod güncel ayarlarla yeniden üretildi.");
                }}
              >
                <RefreshCw size={13} /> Regenerate
              </Button>
              <Dialog.Close asChild>
                <IconButton label="Kod üreticisini kapat">
                  <X size={17} />
                </IconButton>
              </Dialog.Close>
            </div>
          </div>

          <div className="codegen-layout">
            <aside className="codegen-config">
              <div className="codegen-section-heading">
                <FileCode2 size={15} />
                <span>
                  <strong>Configuration</strong>
                  <small>Çıktı hedefini ve assertion’ları seçin.</small>
                </span>
              </div>
              <label>
                Framework
                <select
                  value={config.framework}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      framework: event.target.value as Framework,
                      assertions: Object.fromEntries(
                        Object.entries(current.assertions).map(
                          ([key, selected]) => [
                            key,
                            supportsAssertion(
                              event.target.value as Framework,
                              key as keyof GeneratorConfig["assertions"],
                            )
                              ? selected
                              : false,
                          ],
                        ),
                      ) as GeneratorConfig["assertions"],
                    }))
                  }
                >
                  {frameworks.map((framework) => (
                    <option value={framework.id} key={framework.id}>
                      {framework.label} · {framework.detail}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Package
                <input
                  value={config.packageName}
                  spellCheck={false}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      packageName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Class name
                <input
                  value={config.className}
                  spellCheck={false}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      className: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Build system
                <span className="codegen-segmented">
                  {(["maven", "gradle"] as const).map((system) => (
                    <button
                      type="button"
                      className={cn(config.buildSystem === system && "active")}
                      onClick={() =>
                        setConfig((current) => ({
                          ...current,
                          buildSystem: system,
                        }))
                      }
                      key={system}
                    >
                      {system === "maven" ? "Maven" : "Gradle"}
                    </button>
                  ))}
                </span>
              </label>
              <fieldset className="codegen-assertions">
                <legend>Assertions</legend>
                {(
                  [
                    ["status", "Status code"],
                    ["contentType", "Content type"],
                    ["responseBody", "Response body"],
                    ["responseTime", "Response time < 2 s"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={config.assertions[key]}
                      disabled={!supportsAssertion(config.framework, key)}
                      onChange={() => updateAssertion(key)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <div className="codegen-source">
                <span>Source request</span>
                <strong>
                  {activeTab.method} {requestPath(activeTab.url)}
                </strong>
                <small>
                  Secret değerler üretilen koda eklenmez; environment üzerinden
                  okunur.
                </small>
              </div>
            </aside>

            <section className="codegen-output">
              <div className="codegen-file-tabs" role="tablist">
                {files.map((file) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={file.relativePath === activeFile?.relativePath}
                    className={cn(
                      file.relativePath === activeFile?.relativePath && "active",
                    )}
                    onClick={() => setActiveFilePath(file.relativePath)}
                    key={file.relativePath}
                  >
                    {file.name}
                  </button>
                ))}
              </div>
              <div className="codegen-filebar">
                <code>{activeFile?.relativePath}</code>
                <span>
                  <Button size="sm" variant="ghost" onClick={() => void copyCurrent()}>
                    <Clipboard size={13} /> Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void saveCurrent()}
                  >
                    <Download size={13} /> Save file
                  </Button>
                </span>
              </div>
              <div className="codegen-editor">
                <Suspense
                  fallback={
                    <div className="editor-loading">
                      <LoaderCircle className="spin" size={18} />
                      Kod editörü hazırlanıyor…
                    </div>
                  }
                >
                  <MonacoEditor
                    language={editorLanguage(activeFile?.relativePath ?? "")}
                    value={activeFile?.content ?? ""}
                    theme={
                      document.documentElement.dataset.theme === "dark"
                        ? "vs-dark"
                        : "light"
                    }
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbersMinChars: 3,
                      padding: { top: 12 },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </Suspense>
              </div>
              <div className="codegen-footer">
                <span
                  className={cn(
                    "codegen-notice",
                    notice && "visible",
                    notice?.tone === "danger" && "danger",
                  )}
                  role="status"
                  aria-live="polite"
                >
                  {notice?.tone === "danger" ? (
                    <AlertTriangle size={13} />
                  ) : notice ? (
                    <Check size={13} />
                  ) : (
                    <FileArchive size={13} />
                  )}
                  {notice?.text || `${files.length} generated files ready`}
                </span>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void exportProject()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <FolderOutput size={14} />
                  )}
                  Export to project folder
                </Button>
              </div>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
