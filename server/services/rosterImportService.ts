import fs from "fs";
import path from "path";
import { ApiError } from "../errors/apiError";
import { authService } from "./authService";
import { userRepository } from "../repositories/userRepository";
import { enrollmentService } from "./enrollmentService";
import { accountCredentialService } from "./accountCredentialService";

type NormalizedStudent = {
  email: string;
  displayName: string;
  usernameBase: string;
};

function splitCsvLine(line: string) {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      const isEscaped = line[i + 1] === "\"";
      if (isEscaped) {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

function sanitizeUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, ".")
    .replace(/[.]{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 40);
}

function detectHeaderIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) =>
    candidates.includes(header.trim().toLowerCase()),
  );
}

function normalizeRows(rows: string[][]): NormalizedStudent[] {
  if (rows.length < 2) {
    throw new ApiError(400, "Roster file must include a header and at least one row.");
  }

  const header = rows[0].map((value) => value.trim().toLowerCase());
  const emailIdx = detectHeaderIndex(header, ["email", "student_email", "mail"]);
  const nameIdx = detectHeaderIndex(header, ["name", "full_name", "student_name"]);
  const usernameIdx = detectHeaderIndex(header, ["username", "user_name", "login"]);

  if (emailIdx < 0 || nameIdx < 0) {
    throw new ApiError(
      400,
      "Roster file must contain email and name columns in the header.",
    );
  }

  const seen = new Set<string>();
  const students: NormalizedStudent[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const email = (row[emailIdx] ?? "").trim().toLowerCase();
    const displayName = (row[nameIdx] ?? "").trim();
    const usernameRaw = (row[usernameIdx] ?? "").trim();
    if (!email || !displayName) {
      continue;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ApiError(400, `Invalid email in roster row ${i + 1}: ${email}`);
    }
    if (seen.has(email)) {
      continue;
    }
    seen.add(email);

    const usernameBase = sanitizeUsername(
      usernameRaw || email.split("@")[0] || displayName,
    );
    students.push({
      email,
      displayName,
      usernameBase: usernameBase || `student${i}`,
    });
  }

  if (!students.length) {
    throw new ApiError(400, "No valid students found in roster file.");
  }

  return students;
}

async function parseRosterFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return normalizeRows(lines.map(splitCsvLine));
  }

  if (ext === ".xlsx" || ext === ".xls") {
    try {
      const moduleName = "xlsx";
      const xlsxModule = await import(moduleName);
      const xlsx = (xlsxModule as any).default ?? xlsxModule;
      const workbook = xlsx.readFile(filePath);
      const first = workbook.SheetNames[0];
      if (!first) {
        throw new ApiError(400, "Excel file has no sheets.");
      }
      const sheet = workbook.Sheets[first];
      const rows = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        defval: "",
      }) as string[][];
      return normalizeRows(rows);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        501,
        "Excel parsing dependency is missing. Install 'xlsx' or upload CSV.",
      );
    }
  }

  throw new ApiError(400, "Unsupported roster file type. Use CSV, XLSX, or XLS.");
}

async function uniqueUsername(base: string) {
  let attempt = base || "student";
  let suffix = 1;
  while (await userRepository.findByUsername(attempt)) {
    suffix += 1;
    attempt = `${base}${suffix}`;
  }
  return attempt;
}

export const rosterImportService = {
  async provisionFromFile(input: {
    professorId: string;
    groupId?: string;
    filePath: string;
  }) {
    const rows = await parseRosterFile(input.filePath);
    const created: Array<{
      id: string;
      email: string;
      username: string;
      display_name: string;
      temporaryPassword: string;
      enrolled: boolean;
      wasExisting: boolean;
    }> = [];

    for (const row of rows) {
      const existing = await userRepository.findByEmail(row.email);
      let targetId: string;
      let username = row.usernameBase;
      let tempPassword = "";
      let wasExisting = false;

      if (existing) {
        if (existing.role !== "student") {
          throw new ApiError(
            400,
            `Email ${row.email} belongs to a non-student account.`,
          );
        }
        targetId = existing.id;
        username = existing.username;
        wasExisting = true;
      } else {
        username = await uniqueUsername(row.usernameBase);
        tempPassword = authService.generateRandomPassword();
        const user = await authService.registerUser({
          email: row.email,
          username,
          display_name: row.displayName,
          password: tempPassword,
          role: "student",
          created_by_professor_id: input.professorId,
          must_change_password: true,
        });
        targetId = user.id;
        await accountCredentialService.recordCredential(
          input.professorId,
          targetId,
          tempPassword,
          "import",
        );
      }

      let enrolled = false;
      if (input.groupId) {
        await enrollmentService.addToGroup(input.professorId, input.groupId, {
          studentId: targetId,
        });
        enrolled = true;
      }

      created.push({
        id: targetId,
        email: row.email,
        username,
        display_name: row.displayName,
        temporaryPassword: tempPassword,
        enrolled,
        wasExisting,
      });
    }

    return { created };
  },
};
