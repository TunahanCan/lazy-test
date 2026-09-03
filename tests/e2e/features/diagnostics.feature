@e2e @diagnostics
Feature: Diagnose backend and runtime behavior
  As an API developer
  I want each diagnostics tool to produce actionable results
  So that service failures can be investigated from one workspace

  Background:
    Given Validex is running with a deterministic native bridge
    And I am in the "Diagnostics" workspace

  @happy-path
  Scenario Outline: Complete the primary workflow in every diagnostics mode
    When I open the "<mode>" diagnostics mode
    And I provide the "<input>" diagnostics fixture
    And I run the "<operation>" diagnostics operation
    Then the diagnostics result shows the "<result>" summary
    And a successful diagnostics status is announced
    And the diagnostics workspace has no uncaught frontend error

    Examples:
      | mode         | input                       | operation                 | result                    |
      | Spring       | Spring ProblemDetail response | analyze Spring response      | HTTP and error advice      |
      | JWT          | valid JWT token               | decode JWT                   | header payload and claims  |
      | Runtime      | Actuator endpoint             | capture runtime snapshot     | components and metrics     |
      | Environments | three environment targets     | compare environments         | response differences       |
      | Thread       | blocked thread dump           | analyze thread dump          | thread states              |
      | Logs         | trace-bearing log text        | search trace logs            | matching log lines         |
      | Coverage     | known and observed endpoints  | calculate endpoint coverage  | coverage totals            |

  @performance @happy-path
  Scenario Outline: Run a detailed URL benchmark in its own workspace
    Given the viewport is "<viewport>"
    And I am in the "Performance" workspace
    And I provide the "URL performance target" diagnostics fixture
    When I run the "test URL performance" diagnostics operation
    Then the diagnostics result shows the "URL timing samples" summary
    And a successful diagnostics status is announced
    And no application content overflows the viewport horizontally
    And performance result tables expose labeled cells without hidden horizontal content
    And the diagnostics workspace has no uncaught frontend error

    Examples:
      | viewport |
      | 1440x900 |
      | 390x844  |

  @performance @error
  Scenario: Keep failed samples in the aggregate and continue the benchmark
    Given I am in the "Performance" workspace
    And Diagnostics uses the "English" locale
    And the URL benchmark has one failed and one successful sample
    When I run the "test URL performance" diagnostics operation
    Then the URL benchmark reports both samples and a fifty percent error rate
    And the diagnostics workspace has no uncaught frontend error

  @runtime
  Scenario: Capture a runtime baseline and compare a later snapshot
    Given I am in the "Runtime" diagnostics mode
    And the bridge has two deterministic Actuator snapshots
    When I capture a runtime baseline
    Then the baseline is retained and its successful capture is announced
    When I capture the next runtime snapshot
    Then metric deltas are shown relative to the retained baseline
    When I clear the runtime baseline
    Then the next capture is presented as a standalone snapshot

  @concurrency @error
  Scenario: Ignore a stale diagnostics response after input changes
    Given a diagnostics bridge operation is still in progress
    When I change an input that belongs to the pending operation
    And the previous bridge operation completes
    Then its stale result is not rendered
    And the operation is reported as stale
    And the edited input value and focus are preserved

  @concurrency @i18n
  Scenario: Ignore a stale diagnostics response after changing locale
    Given a diagnostics bridge operation is still in progress
    When I switch Diagnostics to the opposite locale while it is busy
    Then Diagnostics is idle and reports the stale operation in the new locale
    When the previous bridge operation completes
    Then its stale result is not rendered
    And Diagnostics stays idle after the stale bridge completion

  @performance @cancellation @error @i18n
  Scenario Outline: Retry URL performance cancellation when the backend rejects Stop
    Given Diagnostics uses the "<locale>" locale
    And a URL performance sample is still in progress
    And the backend rejects the first performance Stop command
    When I stop the URL performance test
    Then the URL performance test stays busy with a localized actionable Stop error
    And Stop can be retried for the same active URL performance operation
    When I retry stopping the URL performance test
    Then the URL performance test becomes idle and announces cancellation
    And both Stop commands used the active URL performance operation identifier
    And the diagnostics workspace has no uncaught frontend error

    Examples:
      | locale  |
      | English |
      | Türkçe  |

  @active-request @helper-actions
  Scenario: Reuse active request data and recorded coverage
    Given an active request has diagnostics response data
    When I load the active response into Spring diagnostics
    Then its body, status, and headers populate the Spring inputs
    When I use the active trace identifier in log diagnostics
    Then the exact trace identifier populates the log search
    When I analyze recorded endpoint coverage
    Then the recorded coverage call and result are rendered correctly
