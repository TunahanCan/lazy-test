@e2e @json-lab
Feature: Transform and inspect JSON data locally
  As an API developer
  I want focused JSON tools with predictable results
  So that payload investigation stays private and fast

  Background:
    Given Validex is running with a deterministic native bridge
    And I am in the "JSON" workspace

  @happy-path
  Scenario Outline: Complete the primary workflow in every JSON Lab mode
    When I open the "<mode>" JSON Lab mode
    And I provide the "<input>" JSON Lab fixture
    And I run the "<operation>" JSON Lab operation
    Then the JSON Lab result matches the "<result>" fixture
    And a successful operation status is announced
    And the active JSON Lab mode keeps keyboard focus

    Examples:
      | mode   | input                  | operation      | result             |
      | Format | unsorted JSON document | format and sort | formatted JSON      |
      | Diff   | two JSON documents     | compare        | JSON differences   |
      | Query  | nested JSON document   | query JSONPath  | selected JSON value |
      | Schema | representative JSON    | infer schema   | inferred schema    |
      | DTO    | Java response record   | create example | DTO JSON example   |

  @keyboard
  Scenario: Navigate JSON Lab modes and preserve mode-specific input
    Given each JSON Lab input group contains distinct text
    When I navigate the JSON Lab modes with Arrow keys, Home, and End
    Then each selected mode is announced as active
    And each mode restores its own input text
    And derived results are cleared when the mode changes

  @validation @clipboard
  Scenario: Report invalid input and copy a recovered result
    Given I am in the "Format" JSON Lab mode
    When I run JSON formatting with malformed JSON
    Then an accessible JSON validation error is shown
    When I replace the input with valid JSON and format it
    And I copy the JSON Lab result
    Then the clipboard contains the formatted result
    And the copy action temporarily reports success

  @format-actions @focus
  Scenario: Minify and clear JSON without leaving stale output
    Given I am in the "Format" JSON Lab mode
    When I minify a formatted JSON document
    Then the result is compact JSON with the same data
    When I clear the JSON editor
    Then the input, result, and notice are empty and focus returns to the editor
