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

  @active-request @helper-actions
  Scenario: Reuse active request data and recorded coverage
    Given an active request has diagnostics response data
    When I load the active response into Spring diagnostics
    Then its body, status, and headers populate the Spring inputs
    When I use the active trace identifier in log diagnostics
    Then the exact trace identifier populates the log search
    When I analyze recorded endpoint coverage
    Then the recorded coverage call and result are rendered correctly
