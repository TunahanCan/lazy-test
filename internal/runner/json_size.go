package runner

import (
	"encoding"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strconv"
	"strings"
	"unicode/utf8"
)

const maxCollectionJSONDepth = 256

var (
	errJSONSizeLimit = errors.New("JSON size limit exceeded")

	jsonMarshalerType = reflect.TypeOf((*json.Marshaler)(nil)).Elem()
	textMarshalerType = reflect.TypeOf((*encoding.TextMarshaler)(nil)).Elem()
	jsonNumberType    = reflect.TypeOf(json.Number(""))
)

// boundedJSONSize computes the exact encoding/json size for the JSON-native
// value graph used by collection files. It stops at limit, before json.Marshal
// can allocate an arbitrarily large result. Custom marshalers are rejected
// because their output cannot be bounded without invoking them.
func boundedJSONSize(value any, limit int64) (int64, error) {
	if limit < 0 {
		return 0, fmt.Errorf("JSON size limit must not be negative")
	}
	counter := jsonSizeCounter{
		limit: limit,
		stack: make(map[jsonSizeVisit]struct{}),
	}
	if err := counter.addValue(reflect.ValueOf(value), 0); err != nil {
		return counter.size, err
	}
	return counter.size, nil
}

type jsonSizeVisit struct {
	kind    reflect.Kind
	value   uintptr
	typeKey reflect.Type
}

type jsonSizeCounter struct {
	size  int64
	limit int64
	stack map[jsonSizeVisit]struct{}
}

func (counter *jsonSizeCounter) add(amount int64) error {
	if amount < 0 {
		return fmt.Errorf("JSON size contribution must not be negative")
	}
	if amount > counter.limit-counter.size {
		counter.size = counter.limit
		return errJSONSizeLimit
	}
	counter.size += amount
	return nil
}

func (counter *jsonSizeCounter) addValue(
	value reflect.Value,
	depth int,
) error {
	if depth > maxCollectionJSONDepth {
		return fmt.Errorf(
			"collection JSON nesting exceeds %d levels",
			maxCollectionJSONDepth,
		)
	}
	if !value.IsValid() {
		return counter.add(4) // null
	}

	switch value.Kind() {
	case reflect.Interface:
		if value.IsNil() {
			return counter.add(4)
		}
		return counter.addValue(value.Elem(), depth+1)
	case reflect.Pointer:
		if value.IsNil() {
			return counter.add(4)
		}
		if err := rejectCustomJSONEncoding(value.Type()); err != nil {
			return err
		}
		leave, err := counter.enter(value)
		if err != nil {
			return err
		}
		defer leave()
		return counter.addValue(value.Elem(), depth+1)
	}

	if value.Type() == jsonNumberType {
		number := value.Interface().(json.Number)
		if err := counter.add(int64(len(number))); err != nil {
			return err
		}
		if _, err := json.Marshal(number); err != nil {
			return fmt.Errorf("invalid JSON number %q: %w", number, err)
		}
		return nil
	}
	if err := rejectCustomJSONEncoding(value.Type()); err != nil {
		return err
	}

	switch value.Kind() {
	case reflect.Bool:
		if value.Bool() {
			return counter.add(4)
		}
		return counter.add(5)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return counter.add(int64(len(strconv.FormatInt(value.Int(), 10))))
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32,
		reflect.Uint64, reflect.Uintptr:
		return counter.add(int64(len(strconv.FormatUint(value.Uint(), 10))))
	case reflect.Float32, reflect.Float64:
		number := value.Float()
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return fmt.Errorf("unsupported non-finite JSON number %v", number)
		}
		encoded, err := json.Marshal(value.Interface())
		if err != nil {
			return fmt.Errorf("encode JSON number: %w", err)
		}
		return counter.add(int64(len(encoded)))
	case reflect.String:
		return counter.add(jsonStringSize(value.String()))
	case reflect.Slice:
		if value.IsNil() {
			return counter.add(4)
		}
		if value.Type().Elem().Kind() == reflect.Uint8 {
			return counter.add(encodedByteSliceSize(value.Len()))
		}
		return counter.addSequence(value, depth)
	case reflect.Array:
		return counter.addSequence(value, depth)
	case reflect.Map:
		return counter.addMap(value, depth)
	case reflect.Struct:
		return counter.addStruct(value, depth)
	default:
		return fmt.Errorf(
			"unsupported JSON value type %s",
			value.Type(),
		)
	}
}

func (counter *jsonSizeCounter) addSequence(
	value reflect.Value,
	depth int,
) error {
	leave := func() {}
	if value.Kind() == reflect.Slice {
		var err error
		leave, err = counter.enter(value)
		if err != nil {
			return err
		}
	}
	defer leave()

	if err := counter.add(2); err != nil {
		return err
	}
	for index := 0; index < value.Len(); index++ {
		if index > 0 {
			if err := counter.add(1); err != nil {
				return err
			}
		}
		if err := counter.addValue(value.Index(index), depth+1); err != nil {
			return err
		}
	}
	return nil
}

func (counter *jsonSizeCounter) addMap(
	value reflect.Value,
	depth int,
) error {
	if value.IsNil() {
		return counter.add(4)
	}
	if value.Type().Key().Kind() != reflect.String {
		return fmt.Errorf(
			"unsupported non-string JSON map key type %s",
			value.Type().Key(),
		)
	}
	leave, err := counter.enter(value)
	if err != nil {
		return err
	}
	defer leave()

	if err := counter.add(2); err != nil {
		return err
	}
	index := 0
	iterator := value.MapRange()
	for iterator.Next() {
		if index > 0 {
			if err := counter.add(1); err != nil {
				return err
			}
		}
		if err := counter.add(jsonStringSize(iterator.Key().String())); err != nil {
			return err
		}
		if err := counter.add(1); err != nil {
			return err
		}
		if err := counter.addValue(iterator.Value(), depth+1); err != nil {
			return err
		}
		index++
	}
	return nil
}

func (counter *jsonSizeCounter) addStruct(
	value reflect.Value,
	depth int,
) error {
	if err := counter.add(2); err != nil {
		return err
	}
	encodedFields := 0
	valueType := value.Type()
	for index := 0; index < value.NumField(); index++ {
		field := valueType.Field(index)
		if field.PkgPath != "" {
			continue
		}
		if field.Anonymous {
			return fmt.Errorf(
				"unsupported anonymous JSON field %s.%s",
				valueType,
				field.Name,
			)
		}
		name, omitEmpty, err := jsonFieldDefinition(field)
		if err != nil {
			return err
		}
		if name == "-" {
			continue
		}
		fieldValue := value.Field(index)
		if omitEmpty && isEmptyJSONValue(fieldValue) {
			continue
		}
		if encodedFields > 0 {
			if err := counter.add(1); err != nil {
				return err
			}
		}
		if err := counter.add(jsonStringSize(name)); err != nil {
			return err
		}
		if err := counter.add(1); err != nil {
			return err
		}
		if err := counter.addValue(fieldValue, depth+1); err != nil {
			return err
		}
		encodedFields++
	}
	return nil
}

func (counter *jsonSizeCounter) enter(
	value reflect.Value,
) (func(), error) {
	visit := jsonSizeVisit{
		kind:    value.Kind(),
		value:   value.Pointer(),
		typeKey: value.Type(),
	}
	if _, exists := counter.stack[visit]; exists {
		return nil, fmt.Errorf(
			"cyclic JSON value of type %s",
			value.Type(),
		)
	}
	counter.stack[visit] = struct{}{}
	return func() {
		delete(counter.stack, visit)
	}, nil
}

func rejectCustomJSONEncoding(valueType reflect.Type) error {
	if valueType == nil || valueType == jsonNumberType {
		return nil
	}
	if valueType.Implements(jsonMarshalerType) ||
		valueType.Implements(textMarshalerType) {
		return fmt.Errorf(
			"custom JSON marshaler type %s is not supported in collections",
			valueType,
		)
	}
	if valueType.Kind() != reflect.Pointer {
		pointerType := reflect.PointerTo(valueType)
		if pointerType.Implements(jsonMarshalerType) ||
			pointerType.Implements(textMarshalerType) {
			return fmt.Errorf(
				"custom JSON marshaler type %s is not supported in collections",
				pointerType,
			)
		}
	}
	return nil
}

func jsonFieldDefinition(
	field reflect.StructField,
) (name string, omitEmpty bool, err error) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "-", false, nil
	}
	name, options, _ := strings.Cut(tag, ",")
	if name == "" {
		name = field.Name
	}
	for options != "" {
		var option string
		option, options, _ = strings.Cut(options, ",")
		switch option {
		case "":
		case "omitempty":
			omitEmpty = true
		default:
			return "", false, fmt.Errorf(
				"unsupported JSON field option %q on %s.%s",
				option,
				field.Type,
				field.Name,
			)
		}
	}
	return name, omitEmpty, nil
}

func isEmptyJSONValue(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Array, reflect.Map, reflect.Slice, reflect.String:
		return value.Len() == 0
	case reflect.Bool,
		reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32,
		reflect.Uint64, reflect.Uintptr,
		reflect.Float32, reflect.Float64,
		reflect.Interface, reflect.Pointer:
		return value.IsZero()
	default:
		return false
	}
}

func encodedByteSliceSize(length int) int64 {
	encodedLength := int64(length/3) * 4
	if length%3 != 0 {
		encodedLength += 4
	}
	return encodedLength + 2
}

// jsonStringSize mirrors encoding/json's default HTML-safe string escaping.
func jsonStringSize(value string) int64 {
	size := int64(2)
	for index := 0; index < len(value); {
		character := value[index]
		if character < utf8.RuneSelf {
			switch character {
			case '\\', '"', '\b', '\f', '\n', '\r', '\t':
				size += 2
			default:
				if character < 0x20 ||
					character == '<' ||
					character == '>' ||
					character == '&' {
					size += 6
				} else {
					size++
				}
			}
			index++
			continue
		}
		characterValue, width := utf8.DecodeRuneInString(value[index:])
		if characterValue == utf8.RuneError && width == 1 {
			size += 6
			index++
			continue
		}
		if characterValue == '\u2028' || characterValue == '\u2029' {
			size += 6
		} else {
			size += int64(width)
		}
		index += width
	}
	return size
}
