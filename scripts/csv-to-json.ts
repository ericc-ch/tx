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
  outputPathArg ??
  join(
    dirname(inputPath),
    `${basename(inputPath, extname(inputPath))}.json`,
  )

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

writeFileSync(outputFile, `${JSON.stringify(result.data, null, 2)}\n`)
console.log(`Wrote ${result.data.length} rows to ${outputFile}`)
