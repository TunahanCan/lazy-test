@e2e @requests
Feature: Compose requests and inspect responses
  As an API developer
  I want the complete request and response workflow to be dependable
  So that I can investigate APIs without switching applications

  Background:
    Given Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace

  @happy-path
  Scenario: Send a request and receive a formatted JSON response
    Given the bridge will return the "rich JSON response" request result
    When I create a new request
    And I compose a "POST" request to "https://api.example.test/orders"
    And I send the active request
    Then the request is shown as running before it completes
    And the response summary shows status, duration, size, content type, and protocol
    And the response body is formatted as highlighted JSON
    And the application has no uncaught frontend error

  @response
  Scenario Outline: Inspect every response view
    Given the active request has the "rich JSON response" result
    When I open the "<view>" response view
    Then the "<view>" response content is visible
    And the selected response view is announced as active

    Examples:
      | view     |
      | Body     |
      | Headers  |
      | Cookies  |
      | Timeline |
      | Raw      |

  @response @formatting
  Scenario Outline: Present response bodies according to their media type
    Given the active request has a "<fixture>" response
    When I open the "Body" response view
    Then the response body is presented as "<format>"
    And long response lines remain readable without changing their content

    Examples:
      | fixture         | format |
      | JSON document   | JSON   |
      | XML document    | XML    |
      | plain text      | TEXT   |
      | binary payload  | BASE64 |

  @editor
  Scenario Outline: Edit every request configuration section
    Given I have an editable request
    When I open the "<section>" request section
    And I perform the "<edit>" request edit
    Then the "<section>" request data is updated
    And the request tab is marked as a local draft
    And focus remains in the edited request section

    Examples:
      | section   | edit                         |
      | Params    | add and edit a query pair    |
      | Headers   | add and edit a header row    |
      | Body      | format a JSON request body   |
      | Variables | add an environment override  |

  @import @curl
  Scenario: Import a cURL command into a new request
    Given I am on the requests welcome screen
    When I open the cURL import dialog
    And I import a cURL command with method, URL, headers, and body
    Then a new request tab contains the imported method, URL, headers, and body
    And sensitive imported headers are called out without exposing their values
    And focus moves to the imported request URL

  @validation @error
  Scenario: Prevent an invalid request and recover from a send failure
    Given I have an editable request
    When I enter an unsupported request URL
    Then sending is unavailable and the URL error is announced
    When I enter a valid request URL
    And the bridge is configured to fail the next request with a network error
    And I send the active request
    Then a user-facing network error and retry action are shown
    Given the next request attempt will succeed
    When I retry the active request
    Then a successful response replaces the error

  @cancel
  Scenario: Cancel a request that is still running
    Given the next request remains in progress until it is canceled
    When I send the active request
    Then the composer offers a cancel action and disables mutable request fields
    When I cancel the active request
    Then the bridge receives the active request identifier
    And the response area reports a canceled request without an uncaught error
    And the request can be sent again

  @tabs @keyboard
  Scenario: Manage request tabs with mouse and keyboard
    Given I have three clean request tabs and one dirty request tab
    When I navigate request tabs with Arrow keys, Home, and End
    Then focus and the active request follow the keyboard selection
    When I reorder a clean request tab with the keyboard
    Then the tab order changes and focus stays on the moved tab
    When I close the dirty request tab with the keyboard
    Then a discard confirmation is shown
    When I cancel the discard confirmation
    Then the dirty request tab remains open

  @request-actions @editor
  Scenario: Remove query and header rows without losing the editing position
    Given I have an editable request with two query rows and two header rows
    When I remove the first query row
    Then only the remaining query row is kept and its key receives focus
    When I remove every header row
    Then the header editor is empty and the add header action receives focus
    And the request tab is marked as a local draft
    And the application has no uncaught frontend error

  @request-actions @editor @formatting
  Scenario: Format and minify the request JSON body
    Given I have a compact JSON request body
    When I format the request body
    Then the request body is pretty printed exactly and keeps editor focus
    When I minify the request body
    Then the request body is compacted exactly and keeps editor focus
    And the request tab is marked as a local draft
    And the application has no uncaught frontend error

  @request-actions @variables @secrets
  Scenario: Add, reveal, hide, and remove a secret variable override
    Given I am editing request variables in the Local environment
    When I add the secret variable "API_TOKEN" with value "secret-e2e-token"
    Then the secret override is masked and focus returns to the new variable name
    When I reveal the "API_TOKEN" secret override
    Then its exact value is visible and the secret input receives focus
    When I hide the "API_TOKEN" secret override
    Then its value is masked again and the secret input receives focus
    When I remove the "API_TOKEN" secret override
    Then the override is gone and focus moves to the remaining variable value
    And the application has no uncaught frontend error

  @request-actions @response @clipboard
  Scenario: Copy the formatted body, raw response, and trace identifier
    Given the active request has the "rich JSON response" result
    When I copy the response body
    Then the clipboard contains the exact response body and its copy action keeps focus
    When I copy the raw response
    Then the clipboard contains the exact raw response and its copy action keeps focus
    When I copy the response trace identifier
    Then the clipboard contains the exact trace identifier and its copy action keeps focus
    And the application has no uncaught frontend error

  @request-actions @curl @clipboard
  Scenario: Copy a composed request as an exact cURL command
    Given I have a request populated for cURL export
    When I choose Copy as cURL from the send options
    Then the clipboard contains the exact exported cURL command
    And the send options trigger regains focus
    And the application has no uncaught frontend error

  @request-actions @context-panel @clipboard @secrets
  Scenario: Use variable and authorization actions from the context panel
    Given I have a Local request context with a secret variable
    When I copy the ordinary variable from the context panel
    Then its exact value is copied and its copy action keeps focus
    When I copy the secret variable from the context panel
    Then only its exact variable reference is copied and its copy action keeps focus
    When I reveal and hide context panel secrets
    Then the secret value is revealed, remasked, and the toggle keeps focus
    When I add an Authorization header from the context panel
    Then a disabled safe Authorization template is added and the replacement action has focus
    When I open request headers from the context panel
    Then the Headers request section is active and the context action keeps focus
    And the application has no uncaught frontend error

  @request-actions @tabs @context-menu
  Scenario: Rename, pin, duplicate, and close tabs from the request context menu
    Given I have clean request tabs for context menu actions
    When I rename the "Orders" tab to "Orders renamed" from its context menu
    Then the renamed tab is dirty, active, and focused
    When I pin and unpin the renamed tab from its context menu
    Then the renamed tab is unpinned and focused
    When I duplicate the renamed tab from its context menu
    Then an unsaved duplicate is active and focused
    When I close the duplicate from its context menu and confirm discard
    Then the duplicate is removed and the adjacent clean tab receives focus
    And the application has no uncaught frontend error

  @request-actions @tabs @context-menu @disabled-state
  Scenario: Disable bulk tab actions when there is nothing they can close
    Given I have an editable request
    When I open the only request tab context menu
    Then bulk close actions without eligible targets are disabled
    And the application has no uncaught frontend error

  @request-actions @tabs @context-menu
  Scenario: Close every other clean request tab from the context menu
    Given I have clean request tabs and a dirty draft for bulk close actions
    When I choose Close other clean tabs on the "Orders" tab
    Then only the chosen clean tab and dirty draft remain and the chosen tab has focus
    And the application has no uncaught frontend error

  @request-actions @tabs @context-menu
  Scenario: Close clean request tabs to the right from the context menu
    Given I have clean request tabs and a dirty draft for bulk close actions
    When I choose Close clean tabs to the right of the "Orders" tab
    Then the clean right tab is closed, left and dirty tabs remain, and the chosen tab has focus
    And the application has no uncaught frontend error
