@e2e @collections
Feature: Organize requests in collections
  As an API developer
  I want requests to persist in searchable collections
  So that important API workflows can be reopened later

  Background:
    Given Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    And collection storage is writable

  @happy-path @crud
  Scenario: Create, rename, and delete a collection
    Given the request library is empty
    When I create a collection named "Orders"
    Then the "Orders" collection appears in the request library
    When I rename the "Orders" collection to "Order service"
    Then the "Order service" collection appears in the request library
    When I request deletion of the "Order service" collection
    Then the destructive confirmation describes the affected collection
    When I confirm the collection deletion
    Then the collection is removed from the request library and persistent snapshot

  @save @persistence
  Scenario: Save a request and reopen its persisted snapshot
    Given a collection named "Order service" exists
    And I have composed an unsaved request named "Create order"
    When I save the request to the "Order service" collection
    Then durable collection storage contains the saved request
    And the request tab is linked to the saved request and is no longer dirty
    When I close the request tab
    And I reload Validex
    And I reopen "Create order" from the request library
    Then its name, method, URL, headers, body, and variable mode are restored

  @search @move
  Scenario: Search saved requests and move one between collections
    Given the collections "Orders" and "Customers" contain saved requests
    When I search the request library by request method and URL fragment
    Then only matching collections and requests are shown
    And the search result count is announced
    When I clear the request library search
    And I move a saved request from "Orders" to "Customers"
    Then both collection request counts are updated
    And reopening the moved request still restores its data

  @openapi
  Scenario: Import an OpenAPI document and open an endpoint
    Given the file picker will return a valid OpenAPI document with endpoints
    When I import the OpenAPI document
    Then the imported API title and endpoint count are visible
    When I open the imported APIs library
    And I open an imported endpoint
    Then a request tab opens with the endpoint method, URL, and contract metadata
    And the endpoint is marked active in the imported APIs library
