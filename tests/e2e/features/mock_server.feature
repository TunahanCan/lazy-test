@e2e @mock-server
Feature: Configure and run a local mock server
  As an API developer
  I want deterministic mock routes and request history
  So that client development does not depend on a live service

  Background:
    Given Validex is running with a deterministic native bridge
    And I am in the "Mock" workspace
    And the mock server is initially stopped

  @happy-path
  Scenario: Apply a route and start and stop the mock server
    When I add a mock route
    And I configure the route as "GET /orders/42" with status 200 and a JSON response
    Then the route is marked as having unapplied changes
    When I apply the mock routes
    Then the route is synchronized with the native bridge
    When I start the mock server with automatic port selection
    Then the mock server reports a running state and a local base URL
    Given the bridge reports a matching mock request hit
    Then the mock hit history shows its method, path, route, status, and duration
    When I stop the mock server
    Then the mock server reports a stopped state

  @route-editor
  Scenario: Edit, navigate, and delete mock routes
    Given three editable mock routes exist
    When I navigate the mock route list with Arrow keys, Home, and End
    Then the selected route and route editor stay synchronized
    When I change the selected route method, path, status, delay, and enabled state
    Then all route fields are preserved as unapplied changes
    When I delete the selected route and confirm the deletion
    Then an adjacent route becomes selected
    And applying routes persists the remaining routes

  @openapi
  Scenario: Import mock routes from OpenAPI
    Given the mock OpenAPI picker will return valid route definitions
    When I import OpenAPI routes into the mock server
    Then every imported route appears in the route list and editor
    And the imported routes are synchronized with the native bridge

  @validation @error
  Scenario: Reject invalid mock configuration without losing edits
    When I select manual port mode and enter an invalid port
    Then starting the mock server is unavailable and the port is marked invalid
    When I configure a route with invalid headers
    And I attempt to apply the mock routes
    Then a route validation error is announced
    And the invalid route remains available for correction

  @active-response @clipboard @manual-port
  Scenario: Build a route from the active response and copy its running URL
    Given an active request has a reusable JSON response
    When I add a mock route
    And I create the mock route from the active response
    Then the request method, path, status, content type, and body populate the route
    When I apply the mock routes
    And I start the mock server on a manual port with CORS
    And I copy the running mock server URL
    Then the manual start payload and clipboard value are exact

  @active-response @validation
  Scenario: Reject a non-JSON active response without changing the route
    Given an active request has a non-JSON response
    When I add a mock route
    And I try to create the mock route from the active response
    Then an active-response validation error is announced
    And the existing mock route fields remain unchanged
