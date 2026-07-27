package canbridge

// nonNilSlice and nonNilMap keep the JSON bridge contract stable. JavaScript
// consumers expect required collections to be []/{} even when an operation
// fails before it can populate them.
func nonNilSlice[T any](values []T) []T {
	if values == nil {
		return []T{}
	}
	return values
}

func nonNilMap[K comparable, V any](values map[K]V) map[K]V {
	if values == nil {
		return map[K]V{}
	}
	return values
}

func emptyActuatorInspectResult() ActuatorInspectResult {
	return ActuatorInspectResult{
		Metrics: ActuatorMetricSnapshot{
			Metrics: map[string]ActuatorMetricSample{},
		},
		Deltas: []ActuatorMetricDelta{},
	}
}
