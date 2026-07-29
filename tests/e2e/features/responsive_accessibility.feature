@e2e @accessibility
Feature: Use Validex across viewport sizes and input methods
  As a keyboard or small-screen user
  I want the same workflows to remain operable
  So that layout changes never hide functionality or trap focus

  Background:
    Given Validex is running with a deterministic native bridge

  @responsive
  Scenario Outline: Keep the request workbench usable at supported viewports
    Given the viewport is "<viewport>"
    And I am in the "Requests" workspace
    And a request tab with a response is open
    When the responsive layout settles
    Then the main request composer and response remain reachable
    And no application content overflows the viewport horizontally
    And the response uses the expected "<placement>" placement

    Examples:
      | viewport | placement |
      | 1440x900 | desktop   |
      | 1180x800 | desktop   |
      | 900x760  | bottom    |
      | 600x760  | bottom    |
      | 600x420  | bottom    |
      | 1180x650 | desktop   |

  @responsive @drawer @keyboard
  Scenario: Use request side panels as modal drawers on a narrow viewport
    Given the viewport is "600x760"
    And I am in the "Requests" workspace
    When I open the request library drawer
    Then the drawer is modal and the background workspace is inert
    And keyboard focus is trapped inside the drawer
    When I close the drawer with Escape
    Then the drawer closes and focus returns to its restore control
    When I open and dismiss the context drawer using its scrim
    Then focus returns to the context drawer restore control

  @keyboard @tabs @shortcuts
  Scenario: Operate global and request navigation without a pointer
    Given I have multiple request tabs and a completed response
    When I use the documented workspace, request tab, request section, and response view keys
    Then each navigation group keeps exactly one tab in the keyboard tab order
    And focus and selected state move together
    When I use the new request, send, save, and reopen closed tab shortcuts
    Then each shortcut performs its documented action once

  @keyboard @dialog @resizer
  Scenario: Preserve focus through dialogs, menus, and resizers
    Given I am editing a request with both side panels visible
    When I open and cancel the save request dialog
    Then focus stays trapped while the dialog is open and returns to its trigger
    When I resize each side panel and the response panel with the keyboard
    Then every separator announces its updated value within its allowed bounds
    When I open and dismiss a context menu with the keyboard
    Then focus returns to the item that opened the menu

  @responsive @palette @drawer @keyboard
  Scenario: Open a request panel command from a tool workspace
    Given the viewport is "600x760"
    And I am in the "JSON" workspace
    When I open the request library from the command palette
    Then Requests opens with a visible focused request library drawer
    When I close the drawer with Escape
    Then the drawer closes and focus returns to its restore control

  @responsive @keyboard
  Scenario: Preserve focus when a docked panel becomes compact
    Given the viewport is "1440x900"
    And I am in the "Requests" workspace
    And keyboard focus is inside the docked request library
    When the viewport is "600x760"
    Then focus moves to the visible request library restore control
