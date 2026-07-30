@e2e @shell
Feature: Navigate the Validex application shell
  As an API developer
  I want every workspace and global shell action to remain reachable
  So that I can move between tasks without losing context

  Background:
    Given Validex is running with a deterministic native bridge

  @happy-path
  Scenario Outline: Open every workspace from the activity navigation
    Given the application shell is ready
    When I open the "<workspace>" workspace from the activity navigation
    Then the "<workspace>" workspace is the only active workspace
    And the "<heading>" workspace heading is visible
    And the application has no uncaught frontend error

    Examples:
      | workspace   | heading            |
      | Requests    | Requests           |
      | Mock        | Mock Server        |
      | JSON        | JSON Lab           |
      | Diagnostics | Diagnostics        |
      | Protocols   | SSE Stream         |
      | Automation  | Automation         |

  @palette @keyboard
  Scenario: Find and run a command from the command palette
    Given I am in the "Requests" workspace
    When I open the command palette with the platform shortcut
    And I search the command palette for "JSON"
    Then the matching command count and selected command are announced
    When I run the selected command with the keyboard
    Then the "JSON" workspace is active
    And focus moves to the JSON workspace heading

  @settings @layout
  Scenario: Change and reset the request workspace layout from settings
    Given I am in the "Requests" workspace
    And both request side panels are visible
    When I hide the request library from layout settings
    Then the request library is hidden and its restore control is visible
    When I move the response panel using layout settings
    Then the response panel uses the alternate desktop placement
    When I reset the workspace layout
    Then the default spacious request layout is restored

  @settings @theme
  Scenario Outline: Apply every supported theme preference
    Given I am in the "Requests" workspace
    When I select the "<theme>" theme from layout settings
    Then the persisted theme preference is "<theme>"
    And the application uses the expected "<theme>" color scheme

    Examples:
      | theme  |
      | system |
      | light  |
      | dark   |

  @recovery
  Scenario: Recover after application bootstrap fails
    Given application bootstrap fails with technical details
    When I launch Validex
    Then a bootstrap error with retry and details actions is shown
    When I reveal the bootstrap technical details
    Then the bridge failure details are visible
    Given the next bootstrap attempt succeeds
    When I retry application bootstrap
    Then the application shell becomes ready
    And the bootstrap error is no longer present
