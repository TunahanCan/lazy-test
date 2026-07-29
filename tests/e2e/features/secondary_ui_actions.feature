@e2e @secondary-ui
Feature: Use secondary application actions directly
  As an API developer
  I want every visible shell and tool action to work from its own control
  So that I am not forced to rely on shortcuts or indirect navigation

  Background:
    Given Validex is running with a deterministic native bridge

  @topbar @feedback
  Scenario: Use the direct top bar controls and dismiss request feedback
    Given I am in the "JSON" workspace
    When I click the Validex home control
    Then the Requests workspace opens from the top bar
    When I choose the Local environment from the top bar
    Then the Local environment remains selected
    When I open and dismiss the command palette from the top bar
    Then focus returns to the top bar palette control
    When I create a request from the top bar
    Then exactly one new editable request is active
    When I format a valid request body
    Then success feedback is visible and can be dismissed

  @topbar @openapi @notice
  Scenario: Keep a direct OpenAPI import single-flight and dismiss its success notice
    Given the top bar OpenAPI import is pending
    When I start the OpenAPI import from the top bar twice
    Then only one native OpenAPI import is pending
    When the pending top bar import succeeds
    Then the imported API and accessible success notice are visible
    When I dismiss the top bar import notice
    Then the notice closes and focus returns to the import control

  @sidebar @openapi @cancel
  Scenario: Cancel OpenAPI import from the empty API sidebar
    Given I open the empty imported APIs sidebar
    And the next sidebar OpenAPI import is canceled
    When I use the sidebar OpenAPI import action
    Then the sidebar dispatches one import without a false success notice

  @mock-server @clear-hits
  Scenario: Clear mock request history without stopping the server
    Given I am in the "Mock" workspace
    And the mock server is initially stopped
    When I add a mock route
    And I configure the route as "GET /orders/42" with status 200 and a JSON response
    And I apply the mock routes
    And I start the mock server with automatic port selection
    Given the bridge reports a matching mock request hit
    When I clear the mock request history directly
    Then the native history is cleared while the mock server keeps running

  @mock-server @polling @resilience
  Scenario: Recover polling after an older status request hangs permanently
    Given I am in the "Mock" workspace
    And the mock server is initially stopped
    When I add a mock route
    And I configure the route as "GET /orders/42" with status 200 and a JSON response
    And I apply the mock routes
    And I start the mock server with automatic port selection
    Given the next background mock status poll never settles
    When I apply a mock route change while the old status poll remains hung
    Then a newer mock status poll refreshes history independently

  @mock-server @polling @editing @ime
  Scenario: Preserve a long response editor while background polling completes
    Given I am in the "Mock" workspace
    And the mock server is initially stopped
    When I add a mock route
    And I configure the route as "GET /orders/42" with status 200 and a JSON response
    And I apply the mock routes
    And I start the mock server with automatic port selection
    Given a long mock response is being composed with technical details open
    When a background mock status poll completes during editing
    Then the response editor state survives and the latest snapshot appears after editing ends
