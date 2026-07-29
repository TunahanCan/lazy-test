@e2e @request-contract
Feature: Keep request contracts and cancellation isolated
  As an API developer
  I want asynchronous request work to stay attached to the operation that started it
  So that late native results cannot corrupt the response I am inspecting

  Background:
    Given Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace

  @openapi @contract
  Scenario Outline: Validate an imported endpoint with the exact response envelope
    Given the imported Orders OpenAPI endpoint is open
    And OpenAPI validation will return "<outcome>"
    When I send the imported endpoint contract fixture
    Then the validator receives the exact imported response envelope
    And the Contract response section shows "<outcome>"
    And the application has no uncaught frontend error

    Examples:
      | outcome  |
      | success  |
      | findings |

  @openapi @contract @error
  Scenario: Recover when native contract validation rejects
    Given the imported Orders OpenAPI endpoint is open
    And OpenAPI validation will reject
    When I send the imported endpoint contract fixture
    Then the Contract response section explains the validation failure
    And the HTTP response remains available
    And the application has no uncaught frontend error

  @openapi @contract @concurrency
  Scenario: Ignore validation that completes after the operation URL changes
    Given the imported Orders OpenAPI endpoint is open
    And OpenAPI validation is deferred
    When I send the imported endpoint contract fixture
    And I change the imported request URL while validation is pending
    And the stale URL validation completes with findings
    Then the stale URL validation does not annotate the current response

  @openapi @contract @concurrency @input-race
  Scenario: Invalidate validation in the same task as a buffered URL edit
    Given the imported Orders OpenAPI endpoint is open
    And OpenAPI validation is deferred
    When I send the imported endpoint contract fixture
    And I edit the imported URL without blurring and immediately complete validation
    Then the immediate stale validation never annotates the buffered URL edit

  @openapi @contract @concurrency @request-actions
  Scenario: Retire validation when a deterministic imported tab is bulk-closed and reopened
    Given the imported Orders OpenAPI endpoint is open
    And OpenAPI validation is deferred
    When I send the imported response named "retired"
    And I bulk-close and reopen the imported endpoint while validation is pending
    And I send the reopened imported response named "reopened"
    And the "retired" imported validation completes with findings
    Then the reopened imported tab keeps the "reopened" response without the retired contract

  @openapi @contract @concurrency
  Scenario: Keep background-tab validation isolated and ignore an older send
    Given the imported Orders OpenAPI endpoint is open
    And OpenAPI validation is deferred
    When I send the imported response named "old"
    And I send a newer imported response named "current"
    And I open and send a manual request named "other-tab"
    And the current imported validation completes
    Then the manual tab still shows the "other-tab" response
    When the older imported validation completes
    Then the manual tab still shows the "other-tab" response
    And the imported tab shows the "current" response and current contract

  @cancel @keyboard @concurrency
  Scenario: Escape cancels only the active request once across concurrent tabs
    Given two request tabs are concurrently waiting for native responses
    When I press Escape on the second running tab
    Then exactly one cancellation targets the second request ID
    And the first request remains running
    When I activate the first running tab and press Escape
    Then exactly one cancellation targets the first request ID
    And both request tabs can recover independently

  @cancel @error @concurrency
  Scenario Outline: Recover when native cancellation does not complete
    Given a request is waiting for a native response
    And native cancellation will "<result>"
    When I press Escape on the running request
    Then cancellation "<result>" is actionable and sending recovers
    When the late native response completes
    Then the late response cannot replace the cancellation result
    And the application has no uncaught frontend error

    Examples:
      | result |
      | false  |
      | reject |

  @cancel @openapi @contract @concurrency
  Scenario: Ignore contract validation that completes after a newer request is canceled
    Given the imported Orders OpenAPI endpoint is open
    And OpenAPI validation is deferred
    When I send the imported response named "before-cancel"
    And I start a newer imported request that waits for its response
    And I press Escape on the running request
    And the pre-cancel contract validation completes
    Then the canceled response remains current without a stale contract
