import Papa from "papaparse"
import type { Customer } from "@tx/schema"

const PAYMENT_METHOD_ALIASES: Record<string, string> = {
  bca: "BCA Virtual Account",
  mandiri: "Mandiri Virtual Account",
  "va mandiri": "Mandiri Virtual Account",
}

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("0")) return digits.slice(1)
  return digits
}

const normalizeBirthDate = (birthDate: string) => {
  const trimmed = birthDate.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (!match) return trimmed

  const month = match[1]!.padStart(2, "0")
  const day = match[2]!.padStart(2, "0")
  const year = match[3]!
  return `${year}-${month}-${day}`
}

const normalizePaymentMethod = (paymentMethod: string) => {
  const trimmed = paymentMethod.trim()
  return PAYMENT_METHOD_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

export const normalizeCustomer = (raw: typeof Customer.Type): typeof Customer.Type => ({
  name: raw.name.trim(),
  email: raw.email.trim().toLowerCase(),
  birthDate: normalizeBirthDate(raw.birthDate),
  gender: raw.gender.trim().toLowerCase(),
  nik: raw.nik.trim(),
  phone: normalizePhone(raw.phone),
  categories: [
    ...new Set(raw.categories.map((category) => category.trim().toLowerCase()).filter(Boolean)),
  ],
  ticketCount: raw.ticketCount,
  day: raw.day.trim().toLowerCase(),
  membershipCode: raw.membershipCode.trim(),
  paymentMethod: normalizePaymentMethod(raw.paymentMethod),
})

const parseCategories = (raw: string) =>
  raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

const decodeRow = (row: Record<string, string>) => ({
  name: row["Nama Lengkap"]!.trim(),
  email: row.Email!.trim(),
  birthDate: row["Tanggal Lahir"]!.trim(),
  gender: row.Gender!.trim(),
  nik: row["NIK/KTP"]!.trim(),
  phone: row["Nomor Telepon (contoh: 81234567890)"]!.trim(),
  categories: parseCategories(row["Kategori Ticket"]!),
  ticketCount: Number.parseInt(row["Jumlah Ticket"]!.trim(), 10),
  day: row["Day (contoh: day 1)"]!.trim(),
  membershipCode: row["Kode Membership (Presale Only)"]!.trim(),
  paymentMethod: row["Metode Pembayaran"]!.trim(),
})

export const customersFromCsv = (csv: string) => {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  if (result.errors.length > 0) {
    const message = result.errors
      .map((error) => `CSV parse error at row ${error.row}: ${error.message}`)
      .join("\n")
    throw new Error(message)
  }

  return result.data.map(decodeRow).map(normalizeCustomer)
}
