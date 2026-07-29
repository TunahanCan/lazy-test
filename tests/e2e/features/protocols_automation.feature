@e2e
Feature: Inspect streaming protocols and automate API checks
  As an API developer
  I want long-running and repeatable API tools to be controllable
  So that streaming and regression workflows remain trustworthy

  Background:
    Given Validex is running with a deterministic native bridge

  @protocols @sse @happy-path
  Scenario: Listen to and inspect an SSE stream
    Given I am in the "Protocols" workspace
    And the bridge will return an SSE stream with headers and multiple events
    When I configure an SSE connection with URL, headers, timeout, and event limit
    And I start listening to the SSE stream
    Then the protocol form is busy and offers a cancel action while listening
    And the completed result shows HTTP status, duration, and event count
    And every SSE event shows its type, identifier, retry value, and data

  @protocols @sse @cancel
  Scenario: Cancel an SSE stream that is still listening
    Given I am in the "Protocols" workspace
    And the next SSE operation remains in progress until canceled
    When I start listening to the SSE stream
    And I cancel the active protocol operation
    Then the bridge receives the protocol operation identifier
    And focus returns to the listen action when the operation completes

  @automation @happy-path
  Scenario Outline: Complete the primary workflow in every automation mode
    Given I am in the "Automation" workspace
    When I open the "<mode>" automation mode
    And I provide the "<input>" automation fixture
    And I run the "<operation>" automation operation
    Then the automation result shows the "<result>" summary
    And a completed automation status is announced

    Examples:
      | mode         | input                       | operation          | result                         |
      | Runner       | collection with assertions  | run collection   | passed and failed requests     |
      | Network      | redirecting HTTPS endpoint  | analyze network  | DNS redirects and final URL    |
      | OpenAPI lint | OpenAPI document with issues | lint OpenAPI     | errors warnings and issue list |

  @automation @collections
  Scenario: Load a saved collection into Collection Runner
    Given I am in the "Automation" workspace
    And a saved collection contains ordered requests
    When I select and load the saved collection in Collection Runner
    Then the runner definition contains every saved request in collection order
    When I run the loaded collection
    Then every request and assertion result is displayed
    And the total passed, failed, and duration summaries are correct

  @automation @runner-sample
  Scenario: Load and run the built-in Collection Runner sample
    Given I am in the "Automation" workspace
    And I open the "Runner" automation mode
    When I load the built-in runner sample
    Then the sample contains its base URL, request, and all assertions
    When I run the loaded runner sample
    Then the runner bridge receives the unchanged sample and an operation identifier
