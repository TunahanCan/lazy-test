@e2e @storage-resilience
Feature: Keep the collection library safe when storage is unreliable
  As an API developer
  I want collection edits to remain understandable and recoverable
  So that a storage failure never silently loses or replaces my latest work

  @write-failure
  Scenario: Keep the latest in-memory edit when a native save fails
    Given the native collection library is empty and writes fail
    And Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    And collection storage is writable
    When I create a collection named "Offline orders"
    Then the "Offline orders" collection remains visible after the failed write
    And collection storage reports the write failure without false success

  @retry
  Scenario: Retry storage with the latest in-memory snapshot
    Given the native collection library is empty and writes fail
    And Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    And collection storage is writable
    When I create a collection named "Orders draft"
    And I rename the "Orders draft" collection to "Orders latest"
    Then the collection storage write failure is visible
    When native collection storage recovers
    And I retry the collection storage write
    Then durable collection storage contains only the latest name "Orders latest"
    And collection storage returns to the ready state

  @conflict @read-only
  Scenario: Lock every collection mutation after a storage conflict
    Given an editable collection library will reject its next write as a conflict
    And Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    And collection storage is writable
    When I rename the "Orders" collection to "Orders local edit"
    Then the collection storage conflict is visible
    And create, rename, delete, and request save are unavailable after the conflict

  @newer-version @read-only
  Scenario: Refuse to mutate a collection document from a newer Validex
    Given the native collection library contains a newer document version
    And Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    Then the collection library asks for a Validex upgrade
    And create, rename, delete, and request save are unavailable for the newer document

  @concurrency
  Scenario: Prevent an older completion from replacing the newest snapshot
    Given the native collection library is empty and writable
    And Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    And collection storage is writable
    And native collection writes are deferred
    When I create a collection named "First snapshot"
    And I create a collection named "Newest snapshot"
    Then two ordered collection snapshots are pending
    When the newest native write completes before the oldest write
    Then durable collection storage still contains the newest snapshot
    And collection storage returns to the ready state

  @concurrency @conflict
  Scenario: Never replay automatically across a storage conflict
    Given the native collection library is empty and writable
    And Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    And collection storage is writable
    And native collection writes are deferred
    When I create a collection named "First snapshot"
    And I create a collection named "Newest snapshot"
    Then two ordered collection snapshots are pending
    When the newest native write conflicts before the oldest write succeeds
    Then the conflict remains read-only without a compensating write

  @concurrency @write-failure
  Scenario: Leave the saving phase when an older write fails last
    Given the native collection library is empty and writable
    And Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    And collection storage is writable
    And native collection writes are deferred
    When I create a collection named "First snapshot"
    And I create a collection named "Newest snapshot"
    Then two ordered collection snapshots are pending
    When the newest native write succeeds before the oldest write fails
    Then no compensating collection write is needed
    And durable collection storage still contains the newest snapshot without replay
    And collection storage returns to the ready state

  @concurrency @write-failure @stabilization
  Scenario: Keep a saved request dirty when its compensating write fails
    Given the native collection library is empty and writable
    And Validex is running with a deterministic native bridge
    And I am in the "Requests" workspace
    And collection storage is writable
    And native collection writes are deferred
    When I create a collection named "Replay guard"
    And a dirty request is ready for replay-protected saving
    And I begin saving "Replay protected request" to the "Replay guard" collection
    Then the collection creation and saved request snapshots are pending
    When the newest saved request snapshot completes first
    Then the saved request remains dirty without a success status
    When the older collection snapshot completes and overwrites durable storage
    Then a compensating latest snapshot write is pending
    And the saved request remains dirty without a success status
    When the compensating collection write fails
    Then the latest saved request remains in memory as dirty with a storage error
