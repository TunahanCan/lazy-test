package runner

import "unicode/utf8"

const jsonStringDelimiterBytes = int64(2)

// jsonEscapedPrefix returns the longest rune-safe input prefix whose JSON
// string content fits budget. Its accounting mirrors encoding/json with HTML
// escaping enabled, which is also how canbridge serializes reports.
func jsonEscapedPrefix[Text ~string | ~[]byte](
	value Text,
	budget int64,
) (rawBytes int, encodedBytes int64) {
	if budget <= 0 {
		return 0, 0
	}

	for rawBytes < len(value) {
		inputBytes, outputBytes := nextJSONEncodedUnit(value[rawBytes:])
		if outputBytes > budget-encodedBytes {
			break
		}
		rawBytes += inputBytes
		encodedBytes += outputBytes
	}
	return rawBytes, encodedBytes
}

func nextJSONEncodedUnit[Text ~string | ~[]byte](value Text) (int, int64) {
	first := value[0]
	if first < utf8.RuneSelf {
		switch first {
		case '"', '\\', '\b', '\f', '\n', '\r', '\t':
			return 1, 2
		case '<', '>', '&':
			return 1, 6
		default:
			if first < 0x20 {
				return 1, 6
			}
			return 1, 1
		}
	}

	available := min(len(value), utf8.UTFMax)
	runeValue, size := utf8.DecodeRuneInString(string(value[:available]))
	if runeValue == utf8.RuneError && size == 1 {
		return 1, 6
	}
	if runeValue == '\u2028' || runeValue == '\u2029' {
		return size, 6
	}
	return size, int64(size)
}

func jsonQuotedStringBytes(value string) int64 {
	_, contentBytes := jsonEscapedPrefix(value, int64(len(value))*6)
	return jsonStringDelimiterBytes + contentBytes
}
