import { describe, expect, it } from "@effect/vitest"
import { normalizeCustomer } from "../src/lib/csv-to-json.ts"

describe("normalizeCustomer", () => {
  it("normalizes phone, gender, birth date, categories, and payment method", () => {
    const normalized = normalizeCustomer({
      name: "  Tono Tenda ",
      email: "Tono@Example.com",
      birthDate: "7/13/2003",
      gender: "Female",
      nik: " 3122022302230022 ",
      phone: "082259225223",
      categories: [" Cat 1 ", "festival", "cat 1"],
      ticketCount: 1,
      day: " Day 1 ",
      membershipCode: " BA203480222 ",
      paymentMethod: " BCA ",
    })

    expect(normalized).toEqual({
      name: "Tono Tenda",
      email: "tono@example.com",
      birthDate: "2003-07-13",
      gender: "female",
      nik: "3122022302230022",
      phone: "82259225223",
      categories: ["cat 1", "festival"],
      ticketCount: 1,
      day: "day 1",
      membershipCode: "BA203480222",
      paymentMethod: "BCA Virtual Account",
    })
  })

  it("maps mandiri aliases to the tiket payment label", () => {
    expect(
      normalizeCustomer({
        name: "Test",
        email: "test@example.com",
        birthDate: "2000-01-01",
        gender: "female",
        nik: "1234567890123456",
        phone: "81234567890",
        categories: ["cat 1"],
        ticketCount: 1,
        day: "day 1",
        membershipCode: "CODE",
        paymentMethod: "VA MANDIRI",
      }).paymentMethod,
    ).toBe("Mandiri Virtual Account")
  })
})
