/**
 * Type-level transformation: snake_case → camelCase
 */
export type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>;

/**
 * Recursively camelize all keys in an object type
 */
export type CamelizeKeys<T> = T extends Array<infer U>
  ? Array<CamelizeKeys<U>>
  : T extends object
  ? {
      [K in keyof T as CamelCase<string & K>]: CamelizeKeys<T[K]>;
    }
  : T;

/**
 * Type-level transformation: camelCase → snake_case
 */
export type SnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${SnakeCase<U>}`
  : S;

/**
 * Recursively snakeize all keys in an object type
 */
export type SnakeizeKeys<T> = T extends Array<infer U>
  ? Array<SnakeizeKeys<U>>
  : T extends object
  ? {
      [K in keyof T as SnakeCase<string & K>]: SnakeizeKeys<T[K]>;
    }
  : T;
