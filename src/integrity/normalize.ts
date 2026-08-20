export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalizeUnicode(value: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(`unpaired high surrogate at UTF-16 index ${index}`);
      }
      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(`unpaired low surrogate at UTF-16 index ${index}`);
    }
  }

  return value.normalize("NFC");
}

function compareDecimalStrings(first: string, second: string): number {
  const lengthDifference = first.length - second.length;
  if (lengthDifference !== 0) {
    return lengthDifference;
  }
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

function assertDenseJsonArray(value: readonly unknown[]): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`sparse arrays are not JSON values; missing index ${index}`);
    }
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new TypeError("symbol-keyed properties are not JSON values");
    }
    if (key !== "length" && !/^(?:0|[1-9]\d*)$/u.test(key)) {
      throw new TypeError(`array property ${key} is not a JSON array index`);
    }
  }
}

function normalizeArray(
  value: readonly unknown[],
  ancestors: WeakSet<object>,
  propertyKey: string | undefined,
): JsonValue[] {
  assertDenseJsonArray(value);
  const normalized = value.map((item) => normalizeValue(item, ancestors, undefined));
  if (propertyKey !== "tag_ids") {
    return normalized;
  }

  if (!normalized.every((item): item is string => typeof item === "string" && /^(?:0|[1-9]\d*)$/u.test(item))) {
    throw new TypeError("tag_ids must contain canonical non-negative decimal strings");
  }

  return [...normalized].sort(compareDecimalStrings);
}

function normalizeObject(
  value: Record<string, unknown>,
  ancestors: WeakSet<object>,
): { [key: string]: JsonValue } {
  const normalized: { [key: string]: JsonValue } = {};
  const normalizedKeys = new Set<string>();

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new TypeError("symbol-keyed properties are not JSON values");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`JSON object properties must be data properties: ${key}`);
    }
    if (!descriptor.enumerable) {
      throw new TypeError(`non-enumerable properties are not JSON values: ${key}`);
    }

    const normalizedKey = normalizeUnicode(key);
    if (normalizedKeys.has(normalizedKey)) {
      throw new TypeError(`duplicate key after NFC normalization: ${normalizedKey}`);
    }
    normalizedKeys.add(normalizedKey);
    Object.defineProperty(normalized, normalizedKey, {
      configurable: true,
      enumerable: true,
      value: normalizeValue(descriptor.value, ancestors, normalizedKey),
      writable: true,
    });
  }

  return normalized;
}

function normalizeValue(
  value: unknown,
  ancestors: WeakSet<object>,
  propertyKey: string | undefined,
): JsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return normalizeUnicode(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonicalization requires a finite JSON number");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`unsupported JSON value of type ${typeof value}`);
  }
  if (ancestors.has(value)) {
    throw new TypeError("cyclic JSON value is not canonicalizable");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return normalizeArray(value, ancestors, propertyKey);
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonicalization accepts arrays and plain objects only");
    }
    return normalizeObject(value as Record<string, unknown>, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

export function normalizeForCanonicalization(value: unknown): JsonValue {
  return normalizeValue(value, new WeakSet<object>(), undefined);
}
