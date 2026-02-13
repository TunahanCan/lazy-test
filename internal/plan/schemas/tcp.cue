kind: "tcp"
name: string & !=""
host: string & !=""
port: >=1 & <=65535
options?: {
	dial_timeout_ms?: >=1
	timeout_ms?: >=1
	keepalive_ms?: >=0
	nodelay?: bool
	retry?: {
		max_attempts: >=0
		strategy: "none" | "constant" | "exponential"
		base_ms?: >=0
		max_ms?: >=0
	}
	breaker?: {
		window_sec: >=1
		failures: >=1
		half_open: >=0
	}
}
steps: [...{
	kind: "connect" | "write" | "read" | "sleep" | "close"
	write?: {
		bytes?: [...int & >=0 & <=255]
		base64?: string
		hex?: string
	}
	read?: {
		until?: string
		size?: >=0
		timeout_ms?: >=1
		assert?: {
			contains?: string
			regex?: string
			not?: _
			len_range?: {
				min: >=0
				max: >=0
			}
			jsonpath?: string
			jmespath?: string
		}
	}
	sleep_ms?: >=0
}]
