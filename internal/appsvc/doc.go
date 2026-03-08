// Package appsvc provides the application-service layer used by CLI and Desktop.
//
// Java developer mapping:
// - Service: ApplicationService / UseCase facade
// - Workspace methods: file-based repository behavior
// - Start* methods: async orchestrators for long-running jobs
// - RunEventSink: observer/event-publisher interface
package appsvc
