@smoke
Feature: Validex browser smoke
  The production frontend must start and expose every primary workspace.

  Scenario: Start the application with the deterministic native bridge
    Given Validex is open with the deterministic bridge
    Then the application shell is ready
    And all workspace navigation entries are rendered
    And the getting started guide contains three actionable steps

  @bridge-contract
  Scenario: Reject cancellation identifiers that have no active operation
    Given Validex is open with the deterministic bridge
    When I cancel unknown request and tool operation identifiers
    Then neither unknown operation is reported as canceled

  Scenario Outline: Open every primary workspace
    Given Validex is open with the deterministic bridge
    When I select the "<workspace>" workspace
    Then the "<workspace>" workspace is active and visible

    Examples:
      | workspace   |
      | requests    |
      | mock        |
      | json        |
      | diagnostics |
      | protocols   |
      | automation  |
