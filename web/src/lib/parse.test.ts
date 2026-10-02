import { describe, expect, it } from "vitest"
import { firstNumber, parseCodes, parseName, parseSemesters } from "./parse"

describe("onboarding parsers", () => {
  it("names", () => {
    expect(parseName("shehryar")).toBe("Shehryar")
    expect(parseName("my name is diego rosen")).toBe("Diego Rosen")
    expect(parseName("Hi, I'm Ana!")).toBe("Ana")
  })
  it("semesters", () => {
    expect(parseSemesters("just starting")).toBe(0)
    expect(parseSemesters("2")).toBe(2)
    expect(parseSemesters("two semesters")).toBe(2)
    expect(parseSemesters("1 year")).toBe(2)
    expect(parseSemesters("I'm a junior")).toBe(4)
    expect(parseSemesters("banana")).toBeNull()
  })
  it("course codes", () => {
    expect(parseCodes("csc101, math 226 and CSC-300GW")).toEqual(["CSC 101", "MATH 226", "CSC 300GW"])
    expect(parseCodes("none")).toEqual([])
  })
  it("numbers", () => {
    expect(firstNumber("about five")).toBe(5)
    expect(firstNumber("not sure")).toBeNull()
  })
})
