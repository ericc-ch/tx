#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join } from "node:path"
import Papa from "papaparse"

const [inputPath, outputPathArg] = process.argv.slice(2)

if (!inputPath) {
  console.error("Usage: node scripts/csv-to-json.ts <input.csv> [output.json]")
  process.exit(1)
}

const outputFile =
  outputPathArg ?? join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.json`)

const parseCategories = (raw: string) =>
  raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)

const decodeRow = (row: Record<string, string>) => ({
  name: row["Nama Lengkap"].trim(),
  email: row.Email.trim(),
  birthDate: row["Tanggal Lahir"].trim(),
  gender: row.Gender.trim(),
  nik: row["NIK/KTP"].trim(),
  phone: row["Nomor Telepon (contoh: 81234567890)"].trim(),
  categories: parseCategories(row["Kategori Ticket"]),
  ticketCount: Number.parseInt(row["Jumlah Ticket"].trim(), 10),
  day: row["Day (contoh: day 1)"].trim(),
  membershipCode: row["Kode Membership (Presale Only)"].trim(),
  paymentMethod: row["Metode Pembayaran"].trim(),
})

const csv = readFileSync(inputPath, "utf8")
const result = Papa.parse<Record<string, string>>(csv, {
  header: true,
  skipEmptyLines: true,
})

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`CSV parse error at row ${error.row}: ${error.message}`)
  }
  process.exit(1)
}

const customers = result.data.map(decodeRow)
writeFileSync(outputFile, `${JSON.stringify(customers, null, 2)}\n`)
console.log(`Wrote ${customers.length} customers to ${outputFile}`)
