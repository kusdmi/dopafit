// Primitives and types shared across more than one training domain.
export type Id = string;
export type Instant = string;
export type Day = string;
export type Role = "trainer" | "client";
export interface Actor {
  id: Id;
  role: Role;
}
export interface Point {
  date: Day;
  value: number;
}
