import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

// Matches the legacy Apps Script alphabet (Code.js genId()) — excludes
// O/0/I/1 so a VA can't misread a code handed to them over chat or email.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function randomCode(): string {
  let code = "CON_";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Generates a connection short code, retrying on the rare collision. */
export async function generateConnectionShortCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const existing = await prisma.connection.findUnique({ where: { shortCode: code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique connection code — please try again.");
}

/**
 * Normalizes a VA-entered connection code: accepts either the bare 6-char
 * code or the full "CON_" form, case-insensitively, so the submit flow's
 * hint ("type the ID number or CON_ID number, either is fine") holds.
 */
export function normalizeShortCode(input: string): string {
  const trimmed = input.trim().toUpperCase().replace(/\s+/g, "");
  return trimmed.startsWith("CON_") ? trimmed : `CON_${trimmed}`;
}
